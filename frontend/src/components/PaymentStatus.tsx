import { useState } from 'react';

interface Payment {
  id: string;
  amount: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  description: string;
  timestamp: Date;
  txHash?: string;
}

interface PaymentStatusProps {
  payments: Payment[];
}

export function PaymentStatus({ payments }: PaymentStatusProps) {
  const [visible, setVisible] = useState(true);

  if (payments.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 w-96 max-h-[500px] overflow-y-auto z-50">
      <div className="bg-gray-800 rounded-lg shadow-2xl border border-gray-700">
        <div className="flex items-center justify-between p-4 border-b border-gray-700">
          <h3 className="font-semibold text-white flex items-center gap-2">
            <svg
              className="w-5 h-5 text-purple-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z"
              />
            </svg>
            x402 Payments
          </h3>
          <button
            onClick={() => setVisible(!visible)}
            className="text-gray-400 hover:text-white transition-colors"
          >
            {visible ? (
              <svg
                className="w-5 h-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M19 9l-7 7-7-7"
                />
              </svg>
            ) : (
              <svg
                className="w-5 h-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M5 15l7-7 7 7"
                />
              </svg>
            )}
          </button>
        </div>

        {visible && (
          <div className="p-4 space-y-3">
            {payments.map((payment) => (
              <div
                key={payment.id}
                className="bg-gray-900 rounded-lg p-3 border border-gray-700"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <p className="text-sm text-white font-medium">
                      {payment.description}
                    </p>
                    <p className="text-xs text-gray-400 mt-1">
                      {payment.amount} MOVE
                    </p>
                  </div>
                  <PaymentStatusBadge status={payment.status} />
                </div>

                {payment.txHash && (
                  <a
                    href={`https://explorer.movementlabs.xyz/txn/${payment.txHash}?network=testnet`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-purple-400 hover:text-purple-300 mt-2 inline-block"
                  >
                    View on Explorer →
                  </a>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function PaymentStatusBadge({
  status,
}: {
  status: Payment['status'];
}) {
  const config = {
    pending: {
      color: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/50',
      icon: '⏳',
      label: 'Pending',
    },
    processing: {
      color: 'bg-blue-500/20 text-blue-400 border-blue-500/50',
      icon: '🔄',
      label: 'Processing',
    },
    completed: {
      color: 'bg-green-500/20 text-green-400 border-green-500/50',
      icon: '✅',
      label: 'Completed',
    },
    failed: {
      color: 'bg-red-500/20 text-red-400 border-red-500/50',
      icon: '❌',
      label: 'Failed',
    },
  };

  const { color, icon, label } = config[status];

  return (
    <span
      className={`px-2 py-1 rounded-full text-xs font-medium border ${color} flex items-center gap-1`}
    >
      <span>{icon}</span>
      {label}
    </span>
  );
}

