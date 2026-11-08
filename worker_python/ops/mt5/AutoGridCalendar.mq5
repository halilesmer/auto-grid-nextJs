//+------------------------------------------------------------------+
//| AutoGridCalendar.mq5  (NWS-01, plan 1107-A16 S1)                 |
//| Dienst (service): schreibt jede Minute den MT5-Wirtschaftskalender|
//| nach Common\Files\autogrid_calendar.json (UTF-8).                |
//| Der Worker (src/utils/econ_calendar.py) liest die Datei.         |
//|  - Fenster: Monatsanfang -1 Tag bis Monatsende, mindestens       |
//|    jetzt + 7 Tage                                                 |
//|  - Kopf: Server, Zeiten (Server/GMT), written_at, change_id,     |
//|    Zahlen und Fehlercodes                                         |
//|  - Ereignis: Titel (Sprache des Terminals), event_code, Land,    |
//|    Waehrung, Wichtigkeit, Zeit (Serverzeit), time_mode, Sektor,  |
//|    Einheit, Multiplikator, actual/forecast/prev/revised,         |
//|    impact_type                                                    |
//| Die Datei wird jede Minute neu geschrieben (Alter = Bayatlik).   |
//| Atomar: erst Temp-Datei, dann FileMove mit FILE_REWRITE.         |
//| Werte kommen schon durch 10^6 geteilt aus GetXxxValue().         |
//| Gegen den echten Terminal NICHT getestet (nur auf dem VPS).      |
//+------------------------------------------------------------------+
#property service
#property strict

input string FileName = "autogrid_calendar.json";
input int    IntervalSeconds = 60;

string Q(const string s)
  {
   string r = "";
   int n = StringLen(s);
   for(int i = 0; i < n; i++)
     {
      ushort c = StringGetCharacter(s, i);
      if(c == '\\')
         r += "\\\\";
      else if(c == '"')
         r += "\\\"";
      else if(c == '\n')
         r += "\\n";
      else if(c == '\r')
         r += "\\r";
      else if(c == '\t')
         r += "\\t";
      else if(c < 0x20)
         r += StringFormat("\\u%04x", c);
      else
         r += ShortToString(c);
     }
   return "\"" + r + "\"";
  }

// Wert oder null (kein Wert gesetzt)
string Num(const bool has, const double v)
  {
   return has ? DoubleToString(v, 8) : "null";
  }

// "CALENDAR_SECTOR_JOBS" -> "jobs"
string Tail(const string s, const string prefix)
  {
   string r = s;
   StringReplace(r, prefix, "");
   StringToLower(r);
   return r;
  }

void Export()
  {
   datetime now_srv = TimeTradeServer();
   datetime now_gmt = TimeGMT();

   // Fenster: Monatsanfang - 1 Tag ... Monatsende, mindestens jetzt + 7 Tage
   MqlDateTime dt;
   TimeToStruct(now_srv, dt);
   dt.day = 1;
   dt.hour = 0;
   dt.min = 0;
   dt.sec = 0;
   datetime from = StructToTime(dt) - 24 * 3600;
   dt.mon++;
   if(dt.mon > 12)
     {
      dt.mon = 1;
      dt.year++;
     }
   datetime to = StructToTime(dt);
   if(to < now_srv + 7 * 24 * 3600)
      to = now_srv + 7 * 24 * 3600;

   MqlCalendarValue values[];
   ResetLastError();
   int total = CalendarValueHistory(values, from, to);
   int err_history = GetLastError();
   if(total < 0)
      total = 0;

   MqlCalendarValue last_values[];
   ulong change_id = 0;
   ResetLastError();
   int last_count = CalendarValueLast(change_id, last_values);
   int err_last = GetLastError();

   string body = "";
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

      body += (written > 0 ? "," : "") +
              "{\"value_id\":" + IntegerToString((long)values[i].id) +
              ",\"event_id\":" + IntegerToString((long)values[i].event_id) +
              ",\"event_code\":" + Q(ev.event_code) +
              ",\"title\":" + Q(ev.name) +
              ",\"country\":" + Q(co.code) +
              ",\"currency\":" + Q(co.currency) +
              ",\"importance\":" + Q(imp) +
              ",\"time\":" + Q(TimeToString(values[i].time, TIME_DATE | TIME_MINUTES)) +
              ",\"time_mode\":" + Q(Tail(EnumToString(ev.time_mode), "CALENDAR_TIMEMODE_")) +
              ",\"sector\":" + Q(Tail(EnumToString(ev.sector), "CALENDAR_SECTOR_")) +
              ",\"unit\":" + Q(Tail(EnumToString(ev.unit), "CALENDAR_UNIT_")) +
              ",\"multiplier\":" + Q(Tail(EnumToString(ev.multiplier), "CALENDAR_MULTIPLIER_")) +
              ",\"actual\":" + Num(values[i].HasActualValue(), values[i].GetActualValue()) +
              ",\"forecast\":" + Num(values[i].HasForecastValue(), values[i].GetForecastValue()) +
              ",\"prev\":" + Num(values[i].HasPreviousValue(), values[i].GetPreviousValue()) +
              ",\"revised_prev\":" + Num(values[i].HasRevisedValue(), values[i].GetRevisedValue()) +
              ",\"impact_type\":" + Q(impact) + "}";
      written++;
     }

   string doc = "{\"version\":2,\"service\":true" +
                ",\"server\":" + Q(AccountInfoString(ACCOUNT_SERVER)) +
                ",\"time_trade_server\":" + Q(TimeToString(now_srv, TIME_DATE | TIME_SECONDS)) +
                ",\"time_gmt\":" + Q(TimeToString(now_gmt, TIME_DATE | TIME_SECONDS)) +
                ",\"written_at\":" + Q(TimeToString(TimeTradeServer(), TIME_DATE | TIME_SECONDS)) +
                ",\"from\":" + Q(TimeToString(from, TIME_DATE | TIME_SECONDS)) +
                ",\"to\":" + Q(TimeToString(to, TIME_DATE | TIME_SECONDS)) +
                ",\"total\":" + IntegerToString(total) +
                ",\"written\":" + IntegerToString(written) +
                ",\"err_history\":" + IntegerToString(err_history) +
                ",\"err_last\":" + IntegerToString(err_last) +
                ",\"err_event\":" + IntegerToString(err_event) +
                ",\"err_country\":" + IntegerToString(err_country) +
                ",\"last_count\":" + IntegerToString(last_count) +
                ",\"change_id\":" + IntegerToString((long)change_id) +
                ",\"events\":[" + body + "]}";

   // Atomar: erst Temp-Datei, dann umbenennen (der Worker liest nie eine halbe Datei)
   string tmp = FileName + ".tmp";
   int h = FileOpen(tmp, FILE_WRITE | FILE_TXT | FILE_ANSI | FILE_COMMON, 0, CP_UTF8);
   if(h == INVALID_HANDLE)
     {
      Print("AutoGridCalendar: Temp-Datei nicht zu oeffnen, Fehler ", GetLastError());
      return;
     }
   FileWriteString(h, doc);
   FileClose(h);
   ResetLastError();
   if(!FileMove(tmp, FILE_COMMON, FileName, FILE_REWRITE | FILE_COMMON))
     {
      Print("AutoGridCalendar: FileMove fehlgeschlagen, Fehler ", GetLastError());
      return;
     }
  }

void OnStart()
  {
   Print("AutoGridCalendar: Dienst gestartet, Datei Common\\Files\\", FileName);
   int sleep_ms = MathMax(IntervalSeconds, 10) * 1000;
   while(!IsStopped())
     {
      Export();
      Sleep(sleep_ms);
     }
   Print("AutoGridCalendar: Dienst beendet.");
  }
//+------------------------------------------------------------------+
