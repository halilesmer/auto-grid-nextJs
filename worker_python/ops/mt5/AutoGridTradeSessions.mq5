//+------------------------------------------------------------------+
//| AutoGridTradeSessions.mq5  (BKT-21)                              |
//| Schreibt die Handelsseiten (Trade-Sessions) aller Symbole der    |
//| Marktübersicht nach Common\Files\autogrid_trade_sessions.json.   |
//| Der Worker liest die Datei fuer den Backtest (10018-Modell).     |
//| Einmal ausfuehren (Skript auf ein Chart ziehen); nach einer      |
//| Aenderung der Seiten durch den Broker erneut.                    |
//| Gegen den echten Terminal NICHT getestet (nur auf dem VPS).      |
//+------------------------------------------------------------------+
#property script_show_inputs
#property strict

input string FileName = "autogrid_trade_sessions.json";

string Q(const string s)
  {
   string r = s;
   StringReplace(r, "\\", "\\\\");
   StringReplace(r, "\"", "\\\"");
   return "\"" + r + "\"";
  }

void OnStart()
  {
   int h = FileOpen(FileName, FILE_WRITE | FILE_TXT | FILE_ANSI | FILE_COMMON);
   if(h == INVALID_HANDLE)
     {
      Print("AutoGridTradeSessions: Datei nicht zu oeffnen, Fehler ", GetLastError());
      return;
     }
   FileWriteString(h, "{\"version\":1,\"server\":" + Q(AccountInfoString(ACCOUNT_SERVER)) +
                      ",\"exported_at\":" + Q(TimeToString(TimeLocal(), TIME_DATE | TIME_MINUTES)) + ",\"symbols\":{");
   int total = SymbolsTotal(true);
   for(int i = 0; i < total; i++)
     {
      string sym = SymbolName(i, true);
      FileWriteString(h, (i > 0 ? "," : "") + Q(sym) + ":[");
      for(int d = 0; d < 7; d++)
        {
         FileWriteString(h, (d > 0 ? "," : "") + "[");
         datetime from, to;
         for(int k = 0; SymbolInfoSessionTrade(sym, (ENUM_DAY_OF_WEEK)d, k, from, to); k++)
           {
            // from/to: Sekunden ab 00:00 des Tages; to = 24:00 kommt als 86400 oder 0
            long f = (long)from, t = (long)to;
            if(t <= f)
               t = 86400;
            FileWriteString(h, (k > 0 ? "," : "") + "[" + IntegerToString(f) + "," + IntegerToString(t) + "]");
           }
         FileWriteString(h, "]");
        }
      FileWriteString(h, "]");
     }
   FileWriteString(h, "}}");
   FileClose(h);
   Print("AutoGridTradeSessions: ", total, " Symbole nach Common\\Files\\", FileName, " geschrieben.");
  }
