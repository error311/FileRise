import { withBase } from './basePath.js?v={{APP_QVER}}';
import { t } from './i18n.js?v={{APP_QVER}}';
import {
  startTransferProgress,
  finishTransferProgress,
  updateTransferProgress,
  setTransferProgressCancel
} from './transferProgress.js?v={{APP_QVER}}';

const DEFAULT_POLL_MS = 650;
const TERMINAL_STATES = new Set(['done', 'error', 'failed', 'cancelled']);
const MAX_STATUS_RETRIES = 5;

async function readTransferStatus(jobId) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const res = await fetch(withBase(`/api/file/transferJobStatus.php?jobId=${encodeURIComponent(jobId)}&t=${Date.now()}`), {
      credentials: 'include',
      headers: { 'Accept': 'application/json' },
      signal: controller.signal
    });
    const data = await res.json().catch(() => null);
    if (!res.ok || !data?.ok || !data.job) {
      const error = new Error(toErrorMessage(data, `Failed to poll transfer job (HTTP ${res.status}).`));
      error.retryable = [408, 429, 500, 502, 503, 504].includes(res.status) || (res.ok && !data);
      throw error;
    }
    return data.job;
  } catch (error) {
    if (error.retryable === undefined) error.retryable = true;
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeStatus(status) {
  return String(status || '').trim().toLowerCase();
}

function toErrorMessage(payload, fallback) {
  if (payload && typeof payload.error === 'string' && payload.error.trim() !== '') {
    return payload.error.trim();
  }
  if (payload && typeof payload.message === 'string' && payload.message.trim() !== '') {
    return payload.message.trim();
  }
  return fallback;
}

function toProgressUpdate(job) {
  return {
    status: job.status,
    pct: Number.isFinite(job.pct) ? job.pct : undefined,
    filesDone: Number.isFinite(job.filesDone) ? job.filesDone : undefined,
    filesTotal: Number.isFinite(job.selectedFiles) ? job.selectedFiles : undefined,
    bytesDone: Number.isFinite(job.bytesDone) ? job.bytesDone : undefined,
    bytesTotal: Number.isFinite(job.selectedBytes) ? job.selectedBytes : undefined,
    current: typeof job.current === 'string' ? job.current : '',
    cancelRequested: !!job.cancelRequested,
    error: typeof job.error === 'string' ? job.error : ''
  };
}

async function requestTransferCancel(jobId) {
  const res = await fetch(withBase('/api/file/transferJobCancel.php'), {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'X-CSRF-Token': window.csrfToken || ''
    },
    body: JSON.stringify({ jobId })
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data || data.ok !== true) {
    const msg = toErrorMessage(data, `Failed to cancel transfer job (HTTP ${res.status}).`);
    throw new Error(msg);
  }
  return data.job || null;
}

/**
 * Queue an async transfer job and wait until it reaches a terminal state.
 * Throws on start failure or terminal error/cancelled state.
 */
export async function runTransferJob({ kind, payload, progress, pollMs = DEFAULT_POLL_MS }) {
  const kindName = String(kind || '').toLowerCase();
  const isMoveJob = kindName.endsWith('_move');

  const progressJob = startTransferProgress({
    ...(progress || {}),
    state: 'queued',
    indeterminate: true,
    bytesKnown: progress && progress.bytesKnown !== false
  });

  let finished = false;
  let finalJob = null;
  let jobId = '';
  let cancelRequested = false;
  let cancelPromise = null;

  const requestCancel = async () => {
    cancelRequested = true;
    if (!isMoveJob || !jobId) return null;
    if (cancelPromise) return cancelPromise;
    cancelPromise = requestTransferCancel(jobId).finally(() => {
      cancelPromise = null;
    });
    return cancelPromise;
  };

  setTransferProgressCancel(progressJob, {
    cancelable: isMoveJob,
    onCancel: requestCancel
  });

  try {
    const startRes = await fetch(withBase('/api/file/transferJobStart.php'), {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'X-CSRF-Token': window.csrfToken || ''
      },
      body: JSON.stringify({ kind, payload })
    });

    const startData = await startRes.json().catch(() => ({}));
    if (!startRes.ok || !startData || startData.ok !== true || !startData.jobId) {
      const msg = toErrorMessage(startData, `Failed to start transfer job (HTTP ${startRes.status}).`);
      throw new Error(msg);
    }

    jobId = String(startData.jobId);
    if (cancelRequested) {
      try {
        await requestCancel();
      } catch (cancelErr) {
        console.warn('Transfer cancel request failed', cancelErr);
      }
    }

    let statusFailures = 0;
    while (true) {
      try {
        finalJob = await readTransferStatus(jobId);
        statusFailures = 0;
      } catch (error) {
        if (error.retryable && statusFailures < MAX_STATUS_RETRIES) {
          statusFailures++;
          updateTransferProgress(progressJob, { state: 'reconnecting' });
          await sleep(Math.min(8000, Math.max(650, pollMs) * (2 ** (statusFailures - 1))));
          continue;
        }
        error.statusUnknown = true;
        error.message = t('transfer_check_before_retry');
        throw error;
      }
      const st = normalizeStatus(finalJob.status);
      if (TERMINAL_STATES.has(st)) {
        setTransferProgressCancel(progressJob, { cancelable: false });
        if (st === 'done') {
          finishTransferProgress(progressJob, { ok: true });
          finished = true;
          return finalJob;
        }

        const msg = toErrorMessage(finalJob, st === 'cancelled' ? 'Transfer cancelled.' : 'Transfer failed.');
        finishTransferProgress(progressJob, { ok: false, state: st, error: msg });
        finished = true;
        const err = new Error(msg);
        err.job = finalJob;
        err.cancelled = st === 'cancelled';
        throw err;
      }

      updateTransferProgress(progressJob, toProgressUpdate(finalJob));

      await sleep(pollMs);
    }
  } catch (err) {
    if (!finished) {
      setTransferProgressCancel(progressJob, { cancelable: false });
      const msg = err && err.message ? err.message : 'Transfer failed.';
      finishTransferProgress(progressJob, { ok: false, state: err.statusUnknown ? 'unknown' : 'error', error: msg });
    }
    throw err;
  }
}
