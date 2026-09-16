'use client';

interface UpdateResult {
  hasUpdate: boolean;
  localVer: string;
  remoteVer: string;
  loading: boolean;
}

interface UpdateModalProps {
  isOpen: boolean;
  onClose: () => void;
  updateResult: UpdateResult | null;
  onApplyUpdate: () => void;
}

export default function UpdateModal({
  isOpen,
  onClose,
  updateResult,
  onApplyUpdate,
}: UpdateModalProps) {
  if (!isOpen || !updateResult) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="bg-gray-900 border border-white/10 rounded-2xl shadow-2xl p-6 w-full max-w-md">
        <h3 className="text-lg font-bold text-white mb-4">Update Check</h3>
        {updateResult.loading ? (
          <p className="text-gray-400 text-sm">Checking for updates...</p>
        ) : updateResult.hasUpdate ? (
          <div className="space-y-3">
            <p className="text-yellow-400 text-sm font-semibold">
              New version available!
            </p>
            <div className="text-sm text-gray-300 space-y-1">
              <p>
                Current:{' '}
                <span className="text-white font-mono">
                  {updateResult.localVer}
                </span>
              </p>
              <p>
                Latest:{' '}
                <span className="text-green-400 font-mono">
                  {updateResult.remoteVer}
                </span>
              </p>
            </div>
            <button
              onClick={onApplyUpdate}
              className="w-full py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold rounded-lg transition-all active:scale-95"
            >
              Apply Update (git pull)
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-green-400 text-sm font-semibold">
              You are up to date!
            </p>
            <p className="text-sm text-gray-400">
              Version:{' '}
              <span className="text-white font-mono">
                {updateResult.localVer}
              </span>
            </p>
          </div>
        )}
        <button
          onClick={onClose}
          className="w-full mt-4 py-2 text-gray-400 hover:text-white rounded-lg hover:bg-white/10 transition-all"
        >
          Close
        </button>
      </div>
    </div>
  );
}