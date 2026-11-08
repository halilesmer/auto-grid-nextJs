//+------------------------------------------------------------------+
//| AutoGridCalendarProbe.mq5  (NWS-Probe, plan 1107-A16 S1a)        |
//| Einmaliger Test: liefert der MT5-Wirtschaftskalender dieses      |
//| Terminals Daten, und laeuft er in einem Dienst (service)?        |
//| Schreibt Common\Files\autogrid_calendar_probe.json:              |
//|  - Kopf: Server, Zeiten (Server/GMT/lokal), Anzahl, Fehlercodes  |
//|  - Ereignisse [jetzt-24h, jetzt+7d] mit Titel, Land, Waehrung,   |
//|    Wichtigkeit, Zeit (Serverzeit), actual/forecast/prev/revised, |
//|    impact_type                                                   |
//|  - Ende: change_id von CalendarValueLast(0) (fuer die Abfrage)   |
//| Als Dienst einmal laufen lassen; er beendet sich danach selbst.  |
//| Bei Fehler denselben Code als Skript testen (#property service   |
//| entfernen, script_show_inputs setzen): trennt Dienstart/Daten.   |
//| Werte kommen schon durch 10^6 geteilt aus GetXxxValue().         |
//| Gegen den echten Terminal NICHT getestet (nur auf dem VPS).      |
//+------------------------------------------------------------------+
#property service
#property strict

input string FileName = "autogrid_calendar_probe.json";

string Q(const string s)
  {
   string r = s;
   StringReplace(r, "\\", "\\\\");
   StringReplace(r, "\"", "\\\"");
   return "\"" + r + "\"";
  }

// Wert oder null (kein Wert gesetzt)
string Num(const bool has, const double v)
  {
   return has ? DoubleToString(v, 8) : "null";
  }

void OnStart()
  {
   datetime now_srv = TimeTradeServer();
   datetime now_gmt = TimeGMT();
   datetime now_loc = TimeLocal();
   datetime from = now_srv - 24 * 3600;
   datetime to = now_srv + 7 * 24 * 3600;

   MqlCalendarValue values[];
   ResetLastError();
   int total = CalendarValueHistory(values, from, to);
   int err_history = GetLastError();
   if(total < 0)
      total = 0;

   int h = FileOpen(FileName, FILE_WRITE | FILE_TXT | FILE_ANSI | FILE_COMMON);
   if(h == INVALID_HANDLE)
     {
      Print("AutoGridCalendarProbe: Datei nicht zu oeffnen, Fehler ", GetLastError());
      return;
     }

   // Letzte change_id (Basis fuer spaetere inkrementelle Abfrage)
   MqlCalendarValue last_values[];
   ulong change_id = 0;
   ResetLastError();
   int last_count = CalendarValueLast(change_id, last_values);
   int err_last = GetLastError();

   FileWriteString(h, "{\"version\":1,\"service\":true"
                      ",\"server\":" + Q(AccountInfoString(ACCOUNT_SERVER)) +
                      ",\"time_trade_server\":" + Q(TimeToString(now_srv, TIME_DATE | TIME_SECONDS)) +
                      ",\"time_gmt\":" + Q(TimeToString(now_gmt, TIME_DATE | TIME_SECONDS)) +
                      ",\"time_local\":" + Q(TimeToString(now_loc, TIME_DATE | TIME_SECONDS)) +
                      ",\"from\":" + Q(TimeToString(from, TIME_DATE | TIME_SECONDS)) +
                      ",\"to\":" + Q(TimeToString(to, TIME_DATE | TIME_SECONDS)) +
                      ",\"total\":" + IntegerToString(total) +
                      ",\"err_history\":" + IntegerToString(err_history) +
                      ",\"err_last\":" + IntegerToString(err_last) +
                      ",\"events\":[");

   int written = 0;
   int err_event = 0, err_country = 0;
   for(int i = 0; i < total; i++)
     {
      MqlCalendarEvent ev;
      ResetLastError();
      if(!CalendarEventById(values[i].event_id, ev))
        {
         err_event = GetLastError();
         continue;
        }
      MqlCalendarCountry co;
      ResetLastError();
      if(!CalendarCountryById(ev.country_id, co))
        {
         err_country = GetLastError();
         continue;
        }
      string imp = "none";
      if(ev.importance == CALENDAR_IMPORTANCE_LOW)
         imp = "low";
      else if(ev.importance == CALENDAR_IMPORTANCE_MODERATE)
         imp = "moderate";
      else if(ev.importance == CALENDAR_IMPORTANCE_HIGH)
         imp = "high";
      string impact = "none";
      if(values[i].impact_type == CALENDAR_IMPACT_POSITIVE)
         impact = "positive";
      else if(values[i].impact_type == CALENDAR_IMPACT_NEGATIVE)
         impact = "negative";

      FileWriteString(h, (written > 0 ? "," : "") +
                         "{\"value_id\":" + IntegerToString((long)values[i].id) +
                         ",\"event_id\":" + IntegerToString((long)values[i].event_id) +
                         ",\"title\":" + Q(ev.name) +
                         ",\"country\":" + Q(co.code) +
                         ",\"currency\":" + Q(co.currency) +
                         ",\"importance\":" + Q(imp) +
                         ",\"time\":" + Q(TimeToString(values[i].time, TIME_DATE | TIME_MINUTES)) +
                         ",\"actual\":" + Num(values[i].HasActualValue(), values[i].GetActualValue()) +
                         ",\"forecast\":" + Num(values[i].HasForecastValue(), values[i].GetForecastValue()) +
                         ",\"prev\":" + Num(values[i].HasPreviousValue(), values[i].GetPreviousValue()) +
                         ",\"revised_prev\":" + Num(values[i].HasRevisedValue(), values[i].GetRevisedValue()) +
                         ",\"impact_type\":" + Q(impact) + "}");
      written++;
     }

   FileWriteString(h, "],\"written\":" + IntegerToString(written) +
                      ",\"err_event\":" + IntegerToString(err_event) +
                      ",\"err_country\":" + IntegerToString(err_country) +
                      ",\"last_count\":" + IntegerToString(last_count) +
                      ",\"change_id\":" + IntegerToString((long)change_id) + "}");
   FileClose(h);
   Print("AutoGridCalendarProbe: ", written, "/", total, " Ereignisse, change_id ", change_id,
         ", Fehler history=", err_history, " last=", err_last,
         " nach Common\\Files\\", FileName, " geschrieben.");
  }
