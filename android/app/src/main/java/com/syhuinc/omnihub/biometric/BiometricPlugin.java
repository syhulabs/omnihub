package com.syhuinc.omnihub.biometric;

import android.content.Context;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.os.Build;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;

import androidx.annotation.NonNull;
import androidx.biometric.BiometricManager;
import androidx.biometric.BiometricPrompt;
import androidx.core.content.ContextCompat;
import androidx.fragment.app.FragmentActivity;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.security.KeyStore;

import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

/**
 * Fingerprint / face unlock via the system BiometricPrompt, plus a small secret store for the
 * Vault: the Vault's key bytes are kept AES-GCM encrypted under an Android Keystore key and are
 * only decrypted and handed back to JS after the prompt succeeds.
 *
 * Both BIOMETRIC_STRONG and BIOMETRIC_WEAK are accepted so camera-based face unlock (Class 2 on
 * most phones, including the owner's) works. A Class 2 biometric can't gate a Keystore key
 * cryptographically, so the Keystore key is not user-auth-bound: the gate is this plugin never
 * releasing the secret without a successful prompt. Anyone who can run code inside the app's own
 * sandbox could skip that gate -- an acceptable trade for making face unlock usable at all.
 */
@CapacitorPlugin(name = "BiometricPlugin")
public class BiometricPlugin extends Plugin {

    private static final int AUTHENTICATORS =
            BiometricManager.Authenticators.BIOMETRIC_STRONG | BiometricManager.Authenticators.BIOMETRIC_WEAK;

    private static final String PREFS = "omnihub_biometric";
    private static final String PREF_IV = "vault_iv";
    private static final String PREF_DATA = "vault_data";
    private static final String KEYSTORE = "AndroidKeyStore";
    private static final String KEY_ALIAS = "omnihub_vault_biometric";
    private static final String TRANSFORMATION = "AES/GCM/NoPadding";
    private static final int GCM_TAG_BITS = 128;

    private interface OnAuthenticated {
        void run() throws Exception;
    }

    @PluginMethod
    public void check(PluginCall call) {
        Context ctx = getContext();
        int status = BiometricManager.from(ctx).canAuthenticate(AUTHENTICATORS);

        String reason;
        if (status == BiometricManager.BIOMETRIC_SUCCESS) {
            reason = "";
        } else if (status == BiometricManager.BIOMETRIC_ERROR_NONE_ENROLLED) {
            reason = "none_enrolled";
        } else if (status == BiometricManager.BIOMETRIC_ERROR_NO_HARDWARE) {
            reason = "no_hardware";
        } else {
            reason = "unavailable";
        }

        JSObject ret = new JSObject();
        ret.put("available", status == BiometricManager.BIOMETRIC_SUCCESS);
        ret.put("reason", reason);
        ret.put("type", detectType(ctx));
        call.resolve(ret);
    }

    @PluginMethod
    public void authenticate(PluginCall call) {
        showPrompt(call, () -> call.resolve(new JSObject()));
    }

    @PluginMethod
    public void storeSecret(PluginCall call) {
        String secret = call.getString("secret");
        if (secret == null || secret.isEmpty()) {
            call.reject("Missing secret", "invalid_argument");
            return;
        }
        try {
            byte[] plain = Base64.decode(secret, Base64.NO_WRAP);
            Cipher cipher = Cipher.getInstance(TRANSFORMATION);
            cipher.init(Cipher.ENCRYPT_MODE, getOrCreateKey());
            byte[] iv = cipher.getIV();
            byte[] data = cipher.doFinal(plain);
            prefs().edit()
                    .putString(PREF_IV, Base64.encodeToString(iv, Base64.NO_WRAP))
                    .putString(PREF_DATA, Base64.encodeToString(data, Base64.NO_WRAP))
                    .apply();
            call.resolve(new JSObject());
        } catch (Exception e) {
            call.reject("Could not store secret: " + e.getMessage(), "store_failed");
        }
    }

    @PluginMethod
    public void retrieveSecret(PluginCall call) {
        SharedPreferences prefs = prefs();
        String ivB64 = prefs.getString(PREF_IV, null);
        String dataB64 = prefs.getString(PREF_DATA, null);
        if (ivB64 == null || dataB64 == null) {
            call.reject("No secret stored", "no_secret");
            return;
        }
        showPrompt(call, () -> {
            try {
                byte[] iv = Base64.decode(ivB64, Base64.NO_WRAP);
                byte[] data = Base64.decode(dataB64, Base64.NO_WRAP);
                Cipher cipher = Cipher.getInstance(TRANSFORMATION);
                cipher.init(Cipher.DECRYPT_MODE, getOrCreateKey(), new GCMParameterSpec(GCM_TAG_BITS, iv));
                byte[] plain = cipher.doFinal(data);
                JSObject ret = new JSObject();
                ret.put("secret", Base64.encodeToString(plain, Base64.NO_WRAP));
                call.resolve(ret);
            } catch (Exception e) {
                // The Keystore key is gone or no longer matches (e.g. a device reset) -- the
                // stored blob is useless now, so drop it and let JS fall back to the PIN.
                clearStored();
                call.reject("Stored secret is no longer valid", "invalid");
            }
        });
    }

    @PluginMethod
    public void clearSecret(PluginCall call) {
        clearStored();
        call.resolve(new JSObject());
    }

    private void showPrompt(PluginCall call, OnAuthenticated onAuthenticated) {
        String title = call.getString("title", "Unlock");
        String subtitle = call.getString("subtitle", "");
        String negative = call.getString("negativeButtonText", "Use PIN");

        FragmentActivity activity = getActivity();
        if (activity == null) {
            call.reject("No activity", "unavailable");
            return;
        }

        activity.runOnUiThread(() -> {
            if (activity.getSupportFragmentManager().isStateSaved()) {
                // The activity is on its way to the background; the prompt would be a silent
                // no-op and the JS promise would never settle.
                call.reject("Activity not ready", "unavailable");
                return;
            }
            try {
                showPromptOnUiThread(call, activity, title, subtitle, negative, onAuthenticated);
            } catch (Exception e) {
                call.reject("Could not show prompt: " + e.getMessage(), "failed");
            }
        });
    }

    private void showPromptOnUiThread(PluginCall call, FragmentActivity activity, String title, String subtitle,
                                      String negative, OnAuthenticated onAuthenticated) {
        {
            BiometricPrompt.AuthenticationCallback callback = new BiometricPrompt.AuthenticationCallback() {
                @Override
                public void onAuthenticationSucceeded(@NonNull BiometricPrompt.AuthenticationResult result) {
                    try {
                        onAuthenticated.run();
                    } catch (Exception e) {
                        call.reject("Authentication follow-up failed: " + e.getMessage(), "failed");
                    }
                }

                @Override
                public void onAuthenticationError(int errorCode, @NonNull CharSequence errString) {
                    String code;
                    switch (errorCode) {
                        case BiometricPrompt.ERROR_NEGATIVE_BUTTON:
                        case BiometricPrompt.ERROR_USER_CANCELED:
                        case BiometricPrompt.ERROR_CANCELED:
                            code = "cancelled";
                            break;
                        case BiometricPrompt.ERROR_LOCKOUT:
                        case BiometricPrompt.ERROR_LOCKOUT_PERMANENT:
                            code = "lockout";
                            break;
                        case BiometricPrompt.ERROR_NO_BIOMETRICS:
                        case BiometricPrompt.ERROR_HW_NOT_PRESENT:
                        case BiometricPrompt.ERROR_HW_UNAVAILABLE:
                            code = "unavailable";
                            break;
                        default:
                            code = "failed";
                    }
                    call.reject(errString.toString(), code);
                }

                @Override
                public void onAuthenticationFailed() {
                    // A non-matching attempt; the system prompt stays up and lets them retry.
                }
            };

            BiometricPrompt.PromptInfo.Builder builder = new BiometricPrompt.PromptInfo.Builder()
                    .setTitle(title)
                    .setNegativeButtonText(negative)
                    .setAllowedAuthenticators(AUTHENTICATORS)
                    .setConfirmationRequired(false);
            if (!subtitle.isEmpty()) {
                builder.setSubtitle(subtitle);
            }

            BiometricPrompt prompt = new BiometricPrompt(activity, ContextCompat.getMainExecutor(activity), callback);
            prompt.authenticate(builder.build());
        }
    }

    private String detectType(Context ctx) {
        PackageManager pm = ctx.getPackageManager();
        boolean fingerprint = pm.hasSystemFeature(PackageManager.FEATURE_FINGERPRINT);
        boolean face = Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q && pm.hasSystemFeature(PackageManager.FEATURE_FACE);
        boolean iris = Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q && pm.hasSystemFeature(PackageManager.FEATURE_IRIS);
        int count = (fingerprint ? 1 : 0) + (face ? 1 : 0) + (iris ? 1 : 0);
        if (count > 1) return "multiple";
        if (fingerprint) return "fingerprint";
        if (face) return "face";
        if (iris) return "iris";
        return "unknown";
    }

    private SharedPreferences prefs() {
        return getContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    private void clearStored() {
        prefs().edit().remove(PREF_IV).remove(PREF_DATA).apply();
        try {
            KeyStore ks = KeyStore.getInstance(KEYSTORE);
            ks.load(null);
            if (ks.containsAlias(KEY_ALIAS)) {
                ks.deleteEntry(KEY_ALIAS);
            }
        } catch (Exception ignored) {
            // Nothing sensible to do; the blob itself is already gone.
        }
    }

    private SecretKey getOrCreateKey() throws Exception {
        KeyStore ks = KeyStore.getInstance(KEYSTORE);
        ks.load(null);
        if (ks.containsAlias(KEY_ALIAS)) {
            KeyStore.Entry entry = ks.getEntry(KEY_ALIAS, null);
            if (entry instanceof KeyStore.SecretKeyEntry) {
                return ((KeyStore.SecretKeyEntry) entry).getSecretKey();
            }
            ks.deleteEntry(KEY_ALIAS);
        }
        KeyGenerator generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, KEYSTORE);
        generator.init(new KeyGenParameterSpec.Builder(KEY_ALIAS,
                KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setKeySize(256)
                .build());
        return generator.generateKey();
    }
}
