import { onRequest } from 'firebase-functions/v2/https';
import * as functionsV1 from 'firebase-functions/v1';
import { defineSecret } from 'firebase-functions/params';
import * as logger from 'firebase-functions/logger';
import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { GoogleGenAI, Type } from '@google/genai';

initializeApp();

const geminiApiKey = defineSecret('GEMINI_API_KEY');

const DAILY_GENERATION_CAP = 10;
const LINES_PER_TIER = 8;
const MODEL = 'gemini-3.1-flash-lite';
const TTS_MODEL = 'gemini-2.5-flash-preview-tts';

type Personality = 'gentle' | 'friendly';

const PERSONALITY_VOICE: Record<Personality, string> = {
  gentle: 'Soft, warm, caring — like a close friend gently checking in. Never harsh, never guilt-trippy.',
  friendly: 'Casual, upbeat, a little playful — like a buddy texting you, not a parent lecturing you.',
};

/** Same voice used for this personality's hand-recorded preview samples (src/assets/sleep-mode) —
 *  keeps the AI-generated lines sounding like the same "character" the user already heard. */
const TTS_VOICE: Record<Personality, string> = {
  gentle: 'Vindemiatrix',
  friendly: 'Vindemiatrix',
};

/** Validated by ear against a plain style-only prompt — explicitly asking for human imperfection
 *  (breath, pause, non-performance delivery) reads as meaningfully more natural than tone alone. */
function ttsStyleFor(personality: Personality): string {
  return `${PERSONALITY_VOICE[personality]} Deliver it exactly the way a real person would say it out ` +
    'loud to someone they care about, late at night. Natural, unscripted conversational pacing -- not ' +
    'a performance, not a narrator reading a line. Let it have the small imperfections of real speech: ' +
    'a soft breath, natural pauses, genuine warmth. Sound like a real human who just thought of this ' +
    'and said it, not a produced voiceover.';
}

const TIER_GUIDANCE = [
  'Tier 0 (right at bedtime): a light, first nudge. Calm, no urgency yet.',
  "Tier 1 (a bit later): slightly more persistent. Acknowledge they're still up, gently push a bit harder.",
  'Tier 2 (later still): noticeably more insistent, but still in-character and never mean. Real concern shows.',
  "Tier 3 (most persistent): the strongest version of this personality's voice, still true to their character (gentle stays caring even at its most insistent; friendly stays warm even when exasperated). Never actually angry or cruel.",
];

interface GenerateRequestBody {
  personality?: unknown;
}

function isPersonality(value: unknown): value is Personality {
  return value === 'gentle' || value === 'friendly';
}

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Gemini TTS returns raw 16-bit/24kHz/mono PCM with no container -- MediaPlayer (native Android)
 *  needs an actual file format, so wrap it in a minimal WAV header before handing it back. Same
 *  approach the offline preview-sample generation scripts use. */
function pcmToWav(pcm: Buffer): Buffer {
  const sampleRate = 24000;
  const numChannels = 1;
  const bitsPerSample = 16;
  const byteRate = (sampleRate * numChannels * bitsPerSample) / 8;
  const blockAlign = (numChannels * bitsPerSample) / 8;
  const header = Buffer.alloc(44);
  header.write('RIFF', 0, 'ascii');
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write('WAVE', 8, 'ascii');
  header.write('fmt ', 12, 'ascii');
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(numChannels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write('data', 36, 'ascii');
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}

/** Synthesizes one line of speech, returning base64 WAV, or null on any failure -- audio is a
 *  best-effort enhancement layered on top of the text, never allowed to fail the whole request. */
async function synthesizeLine(ai: GoogleGenAI, personality: Personality, text: string): Promise<string | null> {
  try {
    const response = await ai.models.generateContent({
      model: TTS_MODEL,
      contents: [{ role: 'user', parts: [{ text: `${ttsStyleFor(personality)} ${text}` }] }],
      config: {
        responseModalities: ['AUDIO'],
        speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: TTS_VOICE[personality] } } },
      },
    });
    const b64 = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    if (!b64) return null;
    return pcmToWav(Buffer.from(b64, 'base64')).toString('base64');
  } catch (err) {
    logger.warn('TTS synthesis failed for one line', err);
    return null;
  }
}

export const generateSleepReminders = onRequest(
  // One text call plus four voice clips can outlast the default 60 s.
  { secrets: [geminiApiKey], cors: true, region: 'us-central1', timeoutSeconds: 120 },
  async (req, res) => {
    if (req.method !== 'POST') {
      res.status(405).json({ error: 'Method not allowed' });
      return;
    }

    const authHeader = req.headers.authorization ?? '';
    const match = /^Bearer (.+)$/.exec(authHeader);
    if (!match) {
      res.status(401).json({ error: 'Missing Authorization header' });
      return;
    }

    let uid: string;
    try {
      const decoded = await getAuth().verifyIdToken(match[1]);
      uid = decoded.uid;
    } catch (err) {
      logger.warn('Invalid ID token', err);
      res.status(401).json({ error: 'Invalid or expired session. Please sign in again.' });
      return;
    }

    const body = (req.body ?? {}) as GenerateRequestBody;
    if (!isPersonality(body.personality)) {
      res.status(400).json({ error: 'personality must be "gentle" or "friendly".' });
      return;
    }
    const personality = body.personality;

    const db = getFirestore();

    const usageRef = db.doc(`users/${uid}/sleepAiMeta/generationUsage`);

    try {
      const capReached = await db.runTransaction(async (tx) => {
        const snap = await tx.get(usageRef);
        const data = snap.exists ? snap.data() : null;
        const today = todayKey();
        const count = data && data.date === today ? (data.count as number) : 0;
        if (count >= DAILY_GENERATION_CAP) return true;
        tx.set(usageRef, { date: today, count: count + 1 }, { merge: true });
        return false;
      });

      if (capReached) {
        res.status(429).json({
          error: "You've reached today's reminder-generation limit. Try again tomorrow.",
          code: 'rate_limited',
        });
        return;
      }
    } catch (err) {
      logger.error('Rate limit check failed', err);
      res.status(500).json({ error: 'Something went wrong. Please try again.' });
      return;
    }

    const prompt = `Write bedtime reminder lines for the "${personality}" personality of Sleep Mode, a
feature that nudges someone to stop using their phone and go to sleep.

Voice: ${PERSONALITY_VOICE[personality]}

Keep every line generic — no name, no specific personal references.

Write exactly ${LINES_PER_TIER} distinct lines for EACH of these 4 escalation tiers:
${TIER_GUIDANCE.join('\n')}

Rules for every line:
- One short sentence, occasionally two. Never more.
- No emoji, no hashtags, no quotation marks around the line itself.
- Never mention AI, apps, notifications, or that this is generated — it should read like a real person texting.
- Each line must stand completely alone (the user only ever sees one line at a time).
- Lines within the same tier must all be meaningfully different from each other — vary sentence structure and wording, not just swap one word.`;

    const ai = new GoogleGenAI({ apiKey: geminiApiKey.value() });
    let tiers: string[][];
    try {
      const response = await ai.models.generateContent({
        model: MODEL,
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        config: {
          maxOutputTokens: 2000,
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              tiers: {
                type: Type.ARRAY,
                items: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING },
                },
              },
            },
            required: ['tiers'],
          },
        },
      });
      const raw = (response.text ?? '').trim();
      const parsed = JSON.parse(raw) as { tiers?: unknown };
      if (!Array.isArray(parsed.tiers) || parsed.tiers.length !== 4) {
        throw new Error('Malformed tiers shape from model');
      }
      tiers = parsed.tiers.map((tier) =>
        Array.isArray(tier) ? tier.filter((l): l is string => typeof l === 'string' && l.trim().length > 0) : [],
      );
      if (tiers.some((t) => t.length === 0)) throw new Error('One or more tiers came back empty');
    } catch (err) {
      logger.error('Gemini generation failed', err);
      // Give the attempt back: the cap is counted up front (so parallel requests can't overshoot
      // it), and a failed generation used to cost a use anyway. Ten errors locked a user out for
      // the day with nothing generated.
      try {
        await db.runTransaction(async (tx) => {
          const snap = await tx.get(usageRef);
          const data = snap.exists ? snap.data() : null;
          if (data && data.date === todayKey() && (data.count as number) > 0) {
            tx.set(usageRef, { date: data.date, count: (data.count as number) - 1 }, { merge: true });
          }
        });
      } catch (refundErr) {
        logger.warn('Could not refund a failed generation', refundErr);
      }
      res.status(502).json({ error: "Couldn't generate reminders right now. Please try again." });
      return;
    }

    // One real-voice clip per tier (the tier's first line), not all 32 -- enough that the nightly
    // nag sometimes plays genuine Gemini TTS instead of the on-device voice, without a multi-minute
    // background job. Best-effort: any failure here still ships the text-only response below, same
    // as every other audio path in Sleep Mode falling back to on-device TTS.
    const audioClips = await Promise.all(tiers.map((tier) => synthesizeLine(ai, personality, tier[0])));

    res.status(200).json({ tiers, audioClips, generatedAt: Date.now() });
  },
);

/**
 * When an account is deleted, removes everything left under users/{uid}. The app deletes the
 * synced collections itself before deleting the account, but it cannot touch sleepAiMeta (the
 * rules reserve it for this server code), and a second signed-in device can still upload for up
 * to an hour on its old token. This makes "all removed from our servers" true either way.
 */
export const cleanupDeletedUser = functionsV1
  .region('us-central1')
  .auth.user()
  .onDelete(async (user) => {
    const db = getFirestore();
    await db.recursiveDelete(db.doc(`users/${user.uid}`));
    logger.info('Removed remaining data for a deleted account');
  });
