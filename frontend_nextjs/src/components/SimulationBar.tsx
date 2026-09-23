'use client';

import axios from 'axios';
import { useAccountStore, useSystemStore } from '@/store';
import { useEffect } from 'react';
import { FlaskConical } from 'lucide-react';

const rawAPI =
  process.env.NEXT_PUBLIC_API_URL ||
  "https://tweet-overlying-monotone.ngrok-free.dev";
const API = rawAPI.endsWith("/api") ? rawAPI : `${rawAPI}/api`;

axios.defaults.headers.common["ngrok-skip-browser-warning"] = "true";

export default function SimulationBar() {
  const selectedAccount = useAccountStore((s) => s.selectedAccount);
  const simulatedPrice = useSystemStore((s) => s.simulatedPrice);
  const setSimulatedPrice = useSystemStore((s) => s.setSimulatedPrice);
  const isWindows = useSystemStore((s) => s.isWindows);
  const setIsWindows = useSystemStore((s) => s.setIsWindows);

  useEffect(() => {
    axios
      .get(`${API}/system/platform`)
      .then((res) => setIsWindows(res.data.is_windows === true))
      .catch(() => setIsWindows(true));
  }, [setIsWindows]);

  if (isWindows || !selectedAccount) return null;

  const handleChange = (value: number) => {
    setSimulatedPrice(value);
    axios
      .post(`${API}/bot/simulate-price`, {
        account_id: selectedAccount,
        price: value,
      })
      .catch(() => {
        /* silent */
      });
  };

  return (
    <div className="space-y-3 rounded-xl border border-warning/30 bg-warning/[0.05] p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <span className="flex size-7 items-center justify-center rounded-md bg-warning/15 text-warning">
            <FlaskConical size={14} />
          </span>
          <span className="text-sm font-semibold text-warning">
            Mac Test Mode — Price Simulator
          </span>
        </div>
        <span className="font-mono text-lg font-semibold text-foreground">
          ${simulatedPrice.toFixed(2)}
        </span>
      </div>
      <input
        type="range"
        min={50}
        max={150}
        step={0.1}
        value={simulatedPrice}
        onChange={(e) => handleChange(parseFloat(e.target.value))}
        className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-accent accent-warning"
      />
      <div className="flex justify-between font-mono text-[11px] text-muted-foreground">
        <span>$50.00</span>
        <span>$150.00</span>
      </div>
    </div>
  );
}
