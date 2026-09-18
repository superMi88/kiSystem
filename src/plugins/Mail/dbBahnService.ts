import { PrismaClient } from "@prisma/client";

export interface ParsedDbTrip {
  isDbEmail: boolean;
  bookingCode?: string;
  trainNumber?: string;
  originStation?: string;
  destinationStation?: string;
  departureTime?: Date;
  platform?: string;
}

export interface RealtimeTripStatus {
  found: boolean;
  trainNumber: string;
  scheduledDeparture: Date;
  realtimeDeparture?: Date;
  delayMinutes: number;
  scheduledPlatform?: string;
  realtimePlatform?: string;
  isPlatformChanged: boolean;
  isCancelled: boolean;
  message?: string;
}

/**
 * Extrahiert Reisedaten aus eingehenden Buchungs-E-Mails der Deutschen Bahn.
 */
export function parseDbBookingEmail(subject: string, bodyText: string, bodyHtml?: string): ParsedDbTrip | null {
  const content = `${subject}\n${bodyText || ""}\n${(bodyHtml || "").replace(/<[^>]+>/g, " ")}`;

  // Prüfung, ob es sich um eine Bahn-bezogene E-Mail handelt
  const isBahnRelated = 
    /bahn|deutsche\s*bahn|buchungsbestätigung|fahrkarte|auftragsnummer|reiseverbindung|db\s*vertrieb/i.test(subject) ||
    /bahn\.de|deutschebahn|buchungscoupon|auftragsnummer|reiseverbindung/i.test(bodyText || "");

  if (!isBahnRelated) {
    return null;
  }

  // 1. Auftragsnummer / Buchungscode
  let bookingCode: string | undefined;
  const bookingMatch = content.match(/(?:Auftragsnummer|Auftrag|Buchungscode|Buchungs-Code|Order)[:\s]+([A-Z0-9]{6,12})/i);
  if (bookingMatch) {
    bookingCode = bookingMatch[1].toUpperCase();
  }

  // 2. Zugnummer (z. B. "ICE 593", "IC 2045", "RE 1", "RB 24", "ECE 151", "EC 178", "FLX 10")
  let trainNumber: string | undefined;
  const trainMatch = content.match(/\b((?:ICE|IC|EC|ECE|TGV|RJX|RJ|FLX|RE|RB|IRE|S)\s*\d{1,5})\b/i);
  if (trainMatch) {
    trainNumber = trainMatch[1].toUpperCase().replace(/\s+/, " ");
  }

  // 3. Startbahnhof & Zielbahnhof
  let originStation: string | undefined;
  let destinationStation: string | undefined;

  // Suche nach "Von: Station" oder "Abfahrt: Station"
  const fromMatch = content.match(/(?:Von|Startbahnhof|Abfahrt\s+in|Start)[:\s]+([A-Za-z0-9äöüÄÖÜß\.\-\s]+?)(?=(?:\s+nach|\s+Ziel|\s+um|\s+\d{1,2}:|\s*[\r\n]|$))/i);
  if (fromMatch) {
    originStation = cleanStationName(fromMatch[1]);
  }

  // Suche nach "Nach: Station" oder "Ziel: Station"
  const toMatch = content.match(/(?:Nach|Zielbahnhof|Ziel|Ankunft\s+in)[:\s]+([A-Za-z0-9äöüÄÖÜß\.\-\s]+?)(?=(?:\s+um|\s+\d{1,2}:|\s*[\r\n]|$))/i);
  if (toMatch) {
    destinationStation = cleanStationName(toMatch[1]);
  }

  // Fallback: Muster wie "Berlin Hbf -> München Hbf" oder "Berlin Hbf nach München Hbf"
  if (!originStation) {
    const routeMatch = content.match(/([A-Za-z0-9äöüÄÖÜß\.\-\s]+?(?:\s+Hbf|\s+Bahnhof)?)\s*(?:->|nach|–|-)\s*([A-Za-z0-9äöüÄÖÜß\.\-\s]+?(?:\s+Hbf|\s+Bahnhof)?)/i);
    if (routeMatch) {
      originStation = cleanStationName(routeMatch[1]);
      if (!destinationStation) {
        destinationStation = cleanStationName(routeMatch[2]);
      }
    }
  }

  // 4. Datum & Abfahrtszeit
  let departureDateStr: string | undefined;
  const dateMatch = content.match(/\b(\d{1,2})\.(\d{1,2})\.(\d{4}|\d{2})\b/) || content.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  
  let departureTimeStr: string | undefined;
  const timeMatch = content.match(/(?:Abfahrt|ab|um)?\s*(\d{1,2}:\d{2})\s*(?:Uhr)?/i);

  let departureTime: Date | undefined;
  if (dateMatch && timeMatch) {
    try {
      let day: number, month: number, year: number;
      if (dateMatch[3] && dateMatch[3].length === 4 && dateMatch[0].includes("-")) {
        // YYYY-MM-DD
        year = parseInt(dateMatch[1]);
        month = parseInt(dateMatch[2]) - 1;
        day = parseInt(dateMatch[3]);
      } else {
        // DD.MM.YYYY
        day = parseInt(dateMatch[1]);
        month = parseInt(dateMatch[2]) - 1;
        year = parseInt(dateMatch[3].length === 2 ? "20" + dateMatch[3] : dateMatch[3]);
      }

      const [hourStr, minStr] = timeMatch[1].split(":");
      const hours = parseInt(hourStr);
      const minutes = parseInt(minStr);

      const d = new Date(year, month, day, hours, minutes, 0);
      if (!isNaN(d.getTime())) {
        departureTime = d;
      }
    } catch (e) {
      console.error("[DbBahnParser] Fehler beim Parsen des Datums:", e);
    }
  }

  // 5. Gleis (Platform)
  let platform: string | undefined;
  const platformMatch = content.match(/(?:Gleis|Gl\.|Pl\.)\s*([0-9A-Za-z]+)/i);
  if (platformMatch) {
    platform = platformMatch[1].trim();
  }

  // Nur wenn mindestens Zugnummer oder Startbahnhof + Abfahrtszeit gefunden wurden
  if (!trainNumber && (!originStation || !departureTime)) {
    return null;
  }

  return {
    isDbEmail: true,
    bookingCode,
    trainNumber: trainNumber || "Zug",
    originStation: originStation || "Unbekannter Bahnhof",
    destinationStation,
    departureTime: departureTime || new Date(),
    platform
  };
}

function cleanStationName(raw: string): string {
  return raw
    .replace(/^[\s:\-,]+|[\s:\-,]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Sucht die EVA-Nummer eines Bahnhofs über die bahn.expert oRPC API.
 */
export async function lookupStationEva(stationName: string): Promise<string | null> {
  if (!stationName) return null;
  try {
    const url = "https://bahn.expert/api/orpc/stopPlace/byTerm";
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
      },
      body: JSON.stringify({
        json: {
          searchTerm: stationName,
          filterForIris: true,
          max: 3
        }
      })
    });

    if (!res.ok) {
      console.warn(`[BahnExpert] Fehler bei Stationsabfrage für '${stationName}': HTTP ${res.status}`);
      return null;
    }

    const data: any = await res.json();
    const list = data?.json;
    if (Array.isArray(list) && list.length > 0 && list[0].evaNumber) {
      return String(list[0].evaNumber);
    }
  } catch (err) {
    console.error(`[BahnExpert] Exception bei Stationssuche für '${stationName}':`, err);
  }
  return null;
}

/**
 * Fragt Echtzeit-Abfahrten eines Bahnhofs (per EVA) über die bahn.expert oRPC API ab.
 */
export async function fetchRealtimeDepartures(evaNumber: string, lookaheadMinutes: number = 120): Promise<any[]> {
  try {
    const url = "https://bahn.expert/api/orpc/iris/departures";
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
      },
      body: JSON.stringify({
        json: {
          evaNumber,
          lookahead: lookaheadMinutes
        }
      })
    });

    if (!res.ok) {
      console.warn(`[BahnExpert] Fehler bei Abfahrtsabfrage für EVA '${evaNumber}': HTTP ${res.status}`);
      return [];
    }

    const data: any = await res.json();
    const departures = data?.json?.departures;
    if (Array.isArray(departures)) {
      return departures;
    }
  } catch (err) {
    console.error(`[BahnExpert] Exception bei Abfahrtsabfrage für EVA '${evaNumber}':`, err);
  }
  return [];
}

/**
 * Prüft eine konkrete Fahrt anhand von Zugnummer und geplanter Abfahrtszeit auf Verspätung und Gleiswechsel.
 */
export async function checkTripRealtime(
  trip: {
    trainNumber: string;
    originStation: string;
    originEva?: string | null;
    departureTime: Date;
    platform?: string | null;
  }
): Promise<RealtimeTripStatus> {
  const defaultStatus: RealtimeTripStatus = {
    found: false,
    trainNumber: trip.trainNumber,
    scheduledDeparture: trip.departureTime,
    delayMinutes: 0,
    scheduledPlatform: trip.platform || undefined,
    realtimePlatform: trip.platform || undefined,
    isPlatformChanged: false,
    isCancelled: false
  };

  let eva = trip.originEva;
  if (!eva) {
    eva = await lookupStationEva(trip.originStation);
  }
  if (!eva) {
    return defaultStatus;
  }

  const departures = await fetchRealtimeDepartures(eva, 150);
  if (!departures || departures.length === 0) {
    return defaultStatus;
  }

  // Normalisiere Zugnummer zum Abgleich (z. B. "ICE 593" -> Nummer 593 oder String "ICE 593")
  const targetTrainClean = trip.trainNumber.replace(/\s+/g, "").toUpperCase();
  const targetNumberOnly = trip.trainNumber.replace(/\D/g, "");

  const scheduledTripTime = new Date(trip.departureTime).getTime();

  let matchedDep: any = null;
  for (const dep of departures) {
    const depTrainName = (dep.train?.name || "").replace(/\s+/g, "").toUpperCase();
    const depJourneyNum = String(dep.train?.journeyNumber || "");
    const depCategory = (dep.train?.category || "").toUpperCase();

    const isNameMatch = depTrainName.includes(targetTrainClean) || targetTrainClean.includes(depTrainName);
    const isNumberMatch = targetNumberOnly && (depJourneyNum === targetNumberOnly || depTrainName.includes(targetNumberOnly));

    if (isNameMatch || isNumberMatch) {
      // Prüfe Zeitnähe (max. 90 Minuten Abweichung von geplanter Abfahrtszeit)
      const depTime = new Date(dep.departure?.scheduledTime || dep.departure?.time || 0).getTime();
      const diffMinutes = Math.abs(depTime - scheduledTripTime) / (60 * 1000);
      if (diffMinutes <= 90) {
        matchedDep = dep;
        break;
      }
    }
  }

  if (!matchedDep) {
    return defaultStatus;
  }

  const depInfo = matchedDep.departure || {};
  const delayMinutes = typeof depInfo.delay === "number" ? depInfo.delay : 0;
  const isCancelled = !!depInfo.cancelled || !!matchedDep.cancelled;
  
  const schedPlatform = String(depInfo.scheduledPlatform || matchedDep.scheduledPlatform || trip.platform || "").trim();
  const actualPlatform = String(depInfo.platform || matchedDep.platform || schedPlatform).trim();
  const isPlatformChanged = !!(schedPlatform && actualPlatform && schedPlatform !== actualPlatform);

  const realtimeDeparture = depInfo.time ? new Date(depInfo.time) : new Date(scheduledTripTime + delayMinutes * 60 * 1000);

  let message = "";
  if (isCancelled) {
    message = `⚠️ Zugausfall: ${trip.trainNumber} ab ${trip.originStation} (${schedPlatform ? 'Gleis ' + schedPlatform : ''}) fällt aus!`;
  } else if (isPlatformChanged && delayMinutes > 0) {
    message = `⚠️ Gleiswechsel & Verspätung: ${trip.trainNumber} ab ${trip.originStation} fährt jetzt von Gleis ${actualPlatform} (+${delayMinutes} Min.)`;
  } else if (isPlatformChanged) {
    message = `⚠️ Gleiswechsel: ${trip.trainNumber} ab ${trip.originStation} fährt heute ab Gleis ${actualPlatform} (statt ${schedPlatform})!`;
  } else if (delayMinutes >= 5) {
    message = `⏱️ Verspätung: ${trip.trainNumber} ab ${trip.originStation} hat aktuell +${delayMinutes} Minuten Verspätung (Abfahrt ca. ${realtimeDeparture.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })} Uhr).`;
  }

  return {
    found: true,
    trainNumber: trip.trainNumber,
    scheduledDeparture: trip.departureTime,
    realtimeDeparture,
    delayMinutes,
    scheduledPlatform: schedPlatform || undefined,
    realtimePlatform: actualPlatform || undefined,
    isPlatformChanged,
    isCancelled,
    message: message || undefined
  };
}

/**
 * Hintergrundjob zur minütlichen Überwachung aktiver Zugfahrten 60 Minuten vor Abfahrt.
 */
export async function runTrainTripMonitor(prisma: PrismaClient): Promise<{
  checkedCount: number;
  notifications: string[];
}> {
  const now = new Date();
  // 60 Minuten vor Abfahrt bis 30 Minuten nach geplanter Abfahrt
  const windowStart = new Date(now.getTime() - 30 * 60 * 1000);
  const windowEnd = new Date(now.getTime() + 65 * 60 * 1000);

  const notifications: string[] = [];

  try {
    const trips = await (prisma as any).trainTrip.findMany({
      where: {
        isDeleted: false,
        status: { in: ["scheduled", "monitoring"] },
        departureTime: {
          gte: windowStart,
          lte: windowEnd
        }
      }
    });

    for (const trip of trips) {
      try {
        // Falls noch keine EVA vorhanden ist, jetzt nachschlagen und persistieren
        let eva = trip.originEva;
        if (!eva) {
          eva = await lookupStationEva(trip.originStation);
          if (eva) {
            await (prisma as any).trainTrip.update({
              where: { id: trip.id },
              data: { originEva: eva }
            });
          }
        }

        const rt = await checkTripRealtime({
          trainNumber: trip.trainNumber,
          originStation: trip.originStation,
          originEva: eva,
          departureTime: trip.departureTime,
          platform: trip.platform
        });

        const updateData: any = {
          lastCheck: now,
          status: "monitoring"
        };

        if (rt.found) {
          updateData.delayMinutes = rt.delayMinutes;
          updateData.realtimeDeparture = rt.realtimeDeparture;
          if (rt.scheduledPlatform) updateData.platform = rt.scheduledPlatform;
          if (rt.realtimePlatform) updateData.realtimePlatform = rt.realtimePlatform;
          if (rt.isCancelled) updateData.status = "cancelled";

          // Prüfe, ob eine relevante Änderung vorliegt, die benachrichtigt werden muss
          const hadPriorNotice = trip.notificationSent;
          const priorDelay = trip.delayMinutes || 0;
          const priorPlatform = trip.realtimePlatform || trip.platform;

          const isNewDelay = rt.delayMinutes >= 5 && (Math.abs(rt.delayMinutes - priorDelay) >= 5 || !hadPriorNotice);
          const isNewPlatformChange = rt.isPlatformChanged && (rt.realtimePlatform !== priorPlatform || !hadPriorNotice);
          const isNewCancellation = rt.isCancelled && trip.status !== "cancelled";

          if (rt.message && (isNewDelay || isNewPlatformChange || isNewCancellation)) {
            console.log(`[TrainTripMonitor] 🔔 BENACHRICHTIGUNG: ${rt.message}`);
            notifications.push(rt.message);
            updateData.notificationSent = true;
            updateData.lastNotificationMessage = rt.message;
          }
        }

        // Wenn die Fahrt bereits mehr als 20 Minuten in der Vergangenheit liegt
        if (now.getTime() > new Date(trip.departureTime).getTime() + (trip.delayMinutes + 20) * 60 * 1000) {
          updateData.status = "departed";
        }

        await (prisma as any).trainTrip.update({
          where: { id: trip.id },
          data: updateData
        });
      } catch (tripErr) {
        console.error(`[TrainTripMonitor] Fehler bei Fahrt ID ${trip.id}:`, tripErr);
      }
    }

    return { checkedCount: trips.length, notifications };
  } catch (err: any) {
    console.error("[TrainTripMonitor] Fehler im Überwachungszyklus:", err);
    return { checkedCount: 0, notifications: [] };
  }
}
