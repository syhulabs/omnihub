import { useEffect, useRef, useState } from 'react';
import { BarcodeScanner, type Barcode, type BarcodeFormat } from '@capacitor-mlkit/barcode-scanning';
import { Torch } from '@capawesome/capacitor-torch';
import { Icon } from '../../components/Icon';
import { useRouter } from '../../app/Router';
import { useBackHandler } from '../../app/useBackHandler';
import { hapticSuccess } from '../../haptics';
import './BarcodeScannerView.css';

type Status = 'checking' | 'denied' | 'unsupported' | 'scanning' | 'result';

interface BarcodeScannerViewProps {
  title: string;
  formats: BarcodeFormat[];
}

function isUrl(value: string): boolean {
  return /^https?:\/\//i.test(value.trim());
}

export function BarcodeScannerView({ title, formats }: BarcodeScannerViewProps) {
  const { back } = useRouter();
  const [status, setStatus] = useState<Status>('checking');
  const [result, setResult] = useState<Barcode | null>(null);
  const [torchAvailable, setTorchAvailable] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const torchOnRef = useRef(false);
  torchOnRef.current = torchOn;
  const [copied, setCopied] = useState(false);
  const listenerRef = useRef<{ remove: () => void } | null>(null);

  async function stopScanning() {
    document.documentElement.classList.remove('scanner-active');
    if (listenerRef.current) {
      await listenerRef.current.remove();
      listenerRef.current = null;
    }
    try {
      await BarcodeScanner.stopScan();
    } catch {
      // not scanning — fine
    }
    // Read through the ref: the scan listener and the unmount cleanup were created on the first
    // render, when `torchOn` was still false, and would otherwise leave the torch burning.
    if (torchOnRef.current) {
      torchOnRef.current = false;
      try {
        await Torch.disable();
      } catch {
        // ignore
      }
      setTorchOn(false);
    }
  }

  async function startScanning() {
    setStatus('checking');
    try {
      const { supported } = await BarcodeScanner.isSupported();
      if (!supported) {
        setStatus('unsupported');
        return;
      }
    } catch {
      setStatus('unsupported');
      return;
    }

    let permission = await BarcodeScanner.checkPermissions();
    if (permission.camera !== 'granted' && permission.camera !== 'limited') {
      permission = await BarcodeScanner.requestPermissions();
    }
    if (permission.camera !== 'granted' && permission.camera !== 'limited') {
      setStatus('denied');
      return;
    }

    try {
      const { available } = await Torch.isAvailable();
      setTorchAvailable(available);
    } catch {
      setTorchAvailable(false);
    }

    document.documentElement.classList.add('scanner-active');
    listenerRef.current = await BarcodeScanner.addListener('barcodesScanned', async (event) => {
      const barcode = event.barcodes[0];
      if (!barcode) return;
      hapticSuccess();
      setResult(barcode);
      setStatus('result');
      await stopScanning();
    });

    try {
      await BarcodeScanner.startScan({ formats });
      setStatus('scanning');
    } catch {
      document.documentElement.classList.remove('scanner-active');
      setStatus('denied');
    }
  }

  useEffect(() => {
    startScanning();
    return () => {
      void stopScanning();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useBackHandler(() => {
    if (status === 'result') {
      back();
    } else {
      void stopScanning().then(back);
    }
  }, true);

  async function toggleTorch() {
    if (torchOn) {
      await Torch.disable();
      setTorchOn(false);
    } else {
      await Torch.enable();
      setTorchOn(true);
    }
  }

  async function scanAgain() {
    setResult(null);
    await startScanning();
  }

  function copyValue() {
    if (!result) return;
    navigator.clipboard?.writeText(result.displayValue).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  function openLink() {
    if (!result) return;
    window.open(result.displayValue, '_blank');
  }

  return (
    <div className="screen bcs">
      {status === 'scanning' && (
        <div className="bcs__overlay">
          <div className="bcs__topbar">
            <button type="button" className="bcs__icon-btn" onClick={() => stopScanning().then(back)} aria-label="Close scanner">
              <Icon name="x" size={20} />
            </button>
            <span className="bcs__title">{title}</span>
            {torchAvailable ? (
              <button
                type="button"
                className={`bcs__icon-btn${torchOn ? ' bcs__icon-btn--active' : ''}`}
                onClick={toggleTorch}
                aria-label="Toggle torch"
              >
                <Icon name="flashlight" size={20} />
              </button>
            ) : (
              <span className="bcs__icon-btn bcs__icon-btn--spacer" />
            )}
          </div>
          <div className="bcs__frame">
            <span className="bcs__corner bcs__corner--tl" />
            <span className="bcs__corner bcs__corner--tr" />
            <span className="bcs__corner bcs__corner--bl" />
            <span className="bcs__corner bcs__corner--br" />
          </div>
          <p className="bcs__hint">Point your camera at a code</p>
        </div>
      )}

      {status === 'checking' && (
        <div className="bcs__center">
          <p>Starting camera…</p>
        </div>
      )}

      {status === 'unsupported' && (
        <div className="bcs__center">
          <Icon name="info" size={32} className="bcs__center-icon" />
          <p>This device doesn't support barcode scanning.</p>
          <button type="button" className="bcs__btn" onClick={back}>
            Back
          </button>
        </div>
      )}

      {status === 'denied' && (
        <div className="bcs__center">
          <Icon name="info" size={32} className="bcs__center-icon" />
          <p>Camera permission is needed to scan codes.</p>
          <button type="button" className="bcs__btn" onClick={() => BarcodeScanner.openSettings()}>
            Open Settings
          </button>
          <button type="button" className="bcs__btn bcs__btn--secondary" onClick={back}>
            Back
          </button>
        </div>
      )}

      {status === 'result' && result && (
        <div className="bcs__result">
          <div className="bcs__result-icon">
            <Icon name="check" size={28} />
          </div>
          <span className="bcs__result-format">{result.format.replace(/_/g, ' ')}</span>
          <p className="bcs__result-value">{result.displayValue}</p>
          <div className="bcs__result-actions">
            <button type="button" className="bcs__btn" onClick={copyValue}>
              {copied ? 'Copied!' : 'Copy'}
            </button>
            {isUrl(result.displayValue) && (
              <button type="button" className="bcs__btn" onClick={openLink}>
                Open Link
              </button>
            )}
          </div>
          <button type="button" className="bcs__btn bcs__btn--primary" onClick={scanAgain}>
            Scan Again
          </button>
          <button type="button" className="bcs__btn bcs__btn--secondary" onClick={back}>
            Done
          </button>
        </div>
      )}
    </div>
  );
}
