'use client';

import { useEffect, useState } from 'react';

import axios from 'axios';
import { useBotStore } from '@/store/useBotStore';

const rawAPI =
  process.env.NEXT_PUBLIC_API_URL ||
  "https://tweet-overlying-monotone.ngrok-free.dev";
const API = rawAPI.endsWith("/api") ? rawAPI : `${rawAPI}/api`;

axios.defaults.headers.common["ngrok-skip-browser-warning"] = "true";

export default function SimulationBar() {
  const {
    selectedAccount,
    simulatedPrice,
    setSimulatedPrice,
    isWindows,
    setIsWindows,
  } = useBotStore();

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
    <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-xl p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <span className="text-yellow-400 font-bold text-sm">
            Mac Test Mode — Price Simulator
          </span>
        </div>
        <span className="text-yellow-200 font-mono font-bold text-lg">
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
        className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-yellow-500"
      />
      <div className="flex justify-between text-xs text-gray-400">
        <span>$50.00</span>
        <span>$150.00</span>
      </div>
    </div>
  );
}
