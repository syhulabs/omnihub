import { useEffect, useRef, useState } from 'react';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { TextRecognition, type ProcessImageResult } from '@capacitor-mlkit/text-recognition';
import { Icon } from '../../components/Icon';
import { useBackHandler } from '../../app/useBackHandler';
import { hapticTap, hapticSelect, hapticSuccess, hapticWarning } from '../../haptics';
import { applyOperator, formatResult, type Operator } from './logic';
import './NumberScanner.css';

type Phase = 'checking' | 'denied' | 'scanning' | 'processing' | 'reviewing' | 'combine' | 'custom';

const COMBINE_OPS: { op: Operator; label: string }[] = [
  { op: '+', label: 'Add All' },
  { op: '-', label: 'Subtract' },
  { op: '×', label: 'Multiply' },
  { op: '÷', label: 'Divide' },
];

const CUSTOM_OPS: Operator[] = ['+', '-', '×', '÷'];

interface NumberScannerProps {
  onUseResult: (value: number) => void;
  onClose: () => void;
}

/** Picks the largest (most prominent-in-frame) numeric text element from an OCR result. */
function extractBestNumber(result: ProcessImageResult): number | null {
  let best: { value: number; area: number } | null = null;
  for (const block of result.blocks) {
    for (const line of block.lines) {
      for (const el of line.elements) {
        // Prices arrive as one element with the currency attached ("$12.50", "RM12.50"):
        // drop anything before the number, and a trailing symbol too.
        const cleaned = el.text.replace(/,/g, '').trim().replace(/^[^\d-]+/, '').replace(/[^\d.]+$/, '');
        if (!/^-?\d+(\.\d+)?$/.test(cleaned)) continue;
        const value = parseFloat(cleaned);
        if (Number.isNaN(value)) continue;
        const box = el.boundingBox;
        const area = box ? Math.abs((box.right - box.left) * (box.bottom - box.top)) : 1;
        if (!best || area > best.area) best = { value, area };
      }
    }
  }
  return best ? best.value : null;
}

export function NumberScanner({ onUseResult, onClose }: NumberScannerProps) {
  const [phase, setPhase] = useState<Phase>('checking');
  const [detected, setDetected] = useState<number | null>(null);
  const [scanned, setScanned] = useState<number[]>([]);
  const [customOps, setCustomOps] = useState<Operator[]>([]);
  const [toast, setToast] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const unmountedRef = useRef(false);

  function showToast(message: string) {
    setToast(message);
    setTimeout(() => setToast(null), 1800);
  }

  async function startCamera() {
    setPhase('checking');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      if (unmountedRef.current) {
        // Backed out while the permission prompt was up: release the camera instead of leaking it.
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setPhase('scanning');
    } catch {
      hapticWarning();
      setPhase('denied');
    }
  }

  function stopCamera() {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }

  useEffect(() => {
    startCamera();
    return () => {
      unmountedRef.current = true;
      stopCamera();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useBackHandler(() => {
    if (phase === 'custom') {
      setPhase('combine');
    } else if (phase === 'combine') {
      setPhase('scanning');
      startCamera();
    } else if (phase === 'reviewing') {
      rejectNumber();
    } else {
      stopCamera();
      onClose();
    }
  }, true);

  async function capture() {
    if (!videoRef.current || phase !== 'scanning') return;
    hapticTap();
    setPhase('processing');
    const video = videoRef.current;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      setPhase('scanning');
      return;
    }
    ctx.drawImage(video, 0, 0);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
    const base64 = dataUrl.split(',')[1];
    const filename = `shared/number-scan-${Date.now()}.jpg`;

    try {
      await Filesystem.writeFile({ path: filename, data: base64, directory: Directory.Cache, recursive: true });
      const { uri } = await Filesystem.getUri({ path: filename, directory: Directory.Cache });
      const result = await TextRecognition.processImage({ path: uri });
      void Filesystem.deleteFile({ path: filename, directory: Directory.Cache }).catch(() => {});

      const value = extractBestNumber(result);
      if (value === null) {
        hapticWarning();
        showToast("Couldn't read a number — try again");
        setPhase('scanning');
      } else {
        setDetected(value);
        setPhase('reviewing');
      }
    } catch {
      hapticWarning();
      showToast('Scan failed — try again');
      setPhase('scanning');
    }
  }

  function confirmNumber() {
    if (detected === null) return;
    hapticSuccess();
    setScanned((prev) => [...prev, detected]);
    setDetected(null);
    setPhase('scanning');
  }

  function rejectNumber() {
    hapticTap();
    setDetected(null);
    setPhase('scanning');
  }

  function removeScanned(index: number) {
    hapticTap();
    setScanned((prev) => prev.filter((_, i) => i !== index));
  }

  function finishScanning() {
    if (scanned.length === 0) return;
    hapticTap();
    stopCamera();
    setPhase('combine');
  }

  function combineWith(op: Operator) {
    if (scanned.length === 0) return;
    hapticSuccess();
    let result = scanned[0];
    for (let i = 1; i < scanned.length; i++) {
      result = applyOperator(result, scanned[i], op);
    }
    onUseResult(result);
  }

  function startCustom() {
    hapticSelect();
    setCustomOps(new Array(Math.max(0, scanned.length - 1)).fill('+'));
    setPhase('custom');
  }

  function setCustomOp(index: number, op: Operator) {
    hapticSelect();
    setCustomOps((prev) => prev.map((o, i) => (i === index ? op : o)));
  }

  function computeCustom() {
    hapticSuccess();
    let result = scanned[0];
    for (let i = 0; i < customOps.length; i++) {
      result = applyOperator(result, scanned[i + 1], customOps[i]);
    }
    onUseResult(result);
  }

  function closeAndExit() {
    stopCamera();
    onClose();
  }

  return (
    <div className="screen ns">
      <video ref={videoRef} className="ns__video" autoPlay playsInline muted />

      {(phase === 'scanning' || phase === 'processing' || phase === 'reviewing') && (
        <>
          <div className="ns__topbar">
            <button type="button" className="ns__icon-btn" onClick={closeAndExit} aria-label="Close scanner">
              <Icon name="x" size={20} />
            </button>
            <span className="ns__title">Scan Numbers</span>
            <button
              type="button"
              className={`ns__done-btn${scanned.length === 0 ? ' ns__done-btn--disabled' : ''}`}
              onClick={finishScanning}
              disabled={scanned.length === 0}
            >
              Done
            </button>
          </div>

          {phase === 'scanning' && (
            <div className="ns__frame">
              <span className="ns__corner ns__corner--tl" />
              <span className="ns__corner ns__corner--tr" />
              <span className="ns__corner ns__corner--bl" />
              <span className="ns__corner ns__corner--br" />
            </div>
          )}

          {scanned.length > 0 && phase === 'scanning' && (
            <div className="ns__chip-row">
              {scanned.map((n, i) => (
                <button key={i} type="button" className="ns__chip" onClick={() => removeScanned(i)}>
                  {formatResult(n)}
                  <Icon name="x" size={12} />
                </button>
              ))}
            </div>
          )}

          {phase === 'scanning' && (
            <div className="ns__shutter-row">
              <button type="button" className="ns__shutter" onClick={capture} aria-label="Capture number">
                <Icon name="scan" size={26} />
              </button>
              <p className="ns__hint">Point at a number and tap to scan</p>
            </div>
          )}

          {phase === 'processing' && (
            <div className="ns__review">
              <p className="ns__review-label">Reading…</p>
            </div>
          )}

          {phase === 'reviewing' && detected !== null && (
            <div className="ns__review">
              <p className="ns__review-label">Is this right?</p>
              <p className="ns__review-value">{formatResult(detected)}</p>
              <div className="ns__review-actions">
                <button type="button" className="ns__review-btn ns__review-btn--reject" onClick={rejectNumber} aria-label="Rescan">
                  <Icon name="x" size={26} />
                </button>
                <button type="button" className="ns__review-btn ns__review-btn--accept" onClick={confirmNumber} aria-label="Confirm">
                  <Icon name="check" size={26} />
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {phase === 'checking' && (
        <div className="ns__center">
          <p>Starting camera…</p>
        </div>
      )}

      {phase === 'denied' && (
        <div className="ns__center">
          <Icon name="info" size={32} className="ns__center-icon" />
          <p>Camera permission is needed to scan numbers. Enable it in system Settings for Omni Hub.</p>
          <button type="button" className="ns__btn" onClick={closeAndExit}>
            Back
          </button>
        </div>
      )}

      {phase === 'combine' && (
        <div className="ns__combine">
          <div className="ns__combine-header">
            <button type="button" className="ns__icon-btn" onClick={closeAndExit} aria-label="Close scanner">
              <Icon name="x" size={20} />
            </button>
            <span className="ns__title ns__title--dark">Combine Numbers</span>
            <span className="ns__icon-btn ns__icon-btn--spacer" />
          </div>

          <div className="ns__combine-list">
            {scanned.map((n, i) => (
              <span key={i} className="ns__combine-item">
                {formatResult(n)}
              </span>
            ))}
          </div>

          <div className="ns__combine-ops">
            {COMBINE_OPS.map(({ op, label }) => (
              <button key={op} type="button" className="ns__combine-op" onClick={() => combineWith(op)}>
                <span className="ns__combine-op-symbol">{op}</span>
                {label}
              </button>
            ))}
            <button type="button" className="ns__combine-op ns__combine-op--custom" onClick={startCustom} disabled={scanned.length < 2}>
              <Icon name="sliders" size={18} />
              Custom
            </button>
          </div>
        </div>
      )}

      {phase === 'custom' && (
        <div className="ns__combine">
          <div className="ns__combine-header">
            <button type="button" className="ns__icon-btn" onClick={() => setPhase('combine')} aria-label="Back">
              <Icon name="back" size={20} />
            </button>
            <span className="ns__title ns__title--dark">Custom</span>
            <span className="ns__icon-btn ns__icon-btn--spacer" />
          </div>

          <div className="ns__custom-row">
            {scanned.map((n, i) => (
              <span key={i} className="ns__custom-group">
                <span className="ns__combine-item">{formatResult(n)}</span>
                {i < customOps.length && (
                  <span className="ns__op-picker">
                    {CUSTOM_OPS.map((op) => (
                      <button
                        key={op}
                        type="button"
                        className={`ns__op-pill${customOps[i] === op ? ' ns__op-pill--active' : ''}`}
                        onClick={() => setCustomOp(i, op)}
                      >
                        {op}
                      </button>
                    ))}
                  </span>
                )}
              </span>
            ))}
          </div>

          <button type="button" className="ns__btn ns__btn--primary ns__calc-btn" onClick={computeCustom}>
            Calculate
          </button>
        </div>
      )}

      {toast && <div className="ns__toast">{toast}</div>}
    </div>
  );
}
