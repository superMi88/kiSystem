import { PrismaClient } from "@prisma/client";

export type TravelMode = "driving" | "transit" | "bicycling" | "walking";

export interface TransitStep {
  type: "transit" | "walk";
  lineName?: string;
  lineColor?: string | null;
  vehicleName?: string;
  vehicleType?: string;
  vehicleIcon?: string;
  headsign?: string;
  departureStop?: string;
  departureTime?: string;
  departureDateTime?: string;
  arrivalStop?: string;
  arrivalTime?: string;
  arrivalDateTime?: string;
  stopCount?: number;
  transferWaitMinutes?: number | null;
  transferAtStop?: string | null;
  instruction?: string;
  distanceText?: string;
  durationText?: string;
}

export interface TransitDetails {
  departureTime?: string;
  arrivalTime?: string;
  departureDateTime?: string;
  arrivalDateTime?: string;
  departureStop?: string;
  arrivalStop?: string;
  journeyStartTime?: string;
  journeyEndTime?: string;
  journeyStartDateTime?: string;
  journeyEndDateTime?: string;
  earliestDepartureTime?: string;
  requestedDepartureTime?: string;
  targetArrivalTime?: string;
  bufferBeforeMinutes?: number | null;
  pauseBeforeMinutes?: number | null;
  pauseAfterMinutes?: number | null;
  preWalkMinutes?: number;
  postWalkMinutes?: number;
  durationText?: string;
  transfersCount: number;
  totalTransferWaitMinutes?: number;
  lines: string[];
  steps: TransitStep[];
}

export interface CalendarConflictInfo {
  eventId?: number | string;
  title: string;
  start: string;
  end: string;
  conflictType: "overlap" | "tight_buffer";
  message: string;
}

export interface RouteResult {
  origin: string;
  destination: string;
  travelMode: string;
  durationMinutes: number;
  durationText: string;
  distanceMeters: number | null;
  distanceText: string | null;
  summary: string | null;
  googleMapsUrl: string;
  transitDetails?: TransitDetails | null;
  fromCache: boolean;
  departureTime?: string | null;
  arrivalTime?: string | null;
  journeyStartTime?: string | null;
  journeyEndTime?: string | null;
  journeyStartDateTime?: string | null;
  journeyEndDateTime?: string | null;
  earliestDepartureTime?: string | null;
  requestedDepartureTime?: string | null;
  targetArrivalTime?: string | null;
  bufferBeforeMinutes?: number | null;
  pauseBeforeMinutes?: number | null;
  pauseAfterMinutes?: number | null;
  alternatives?: RouteResult[];
  calendarConflicts?: CalendarConflictInfo[];
  hasCalendarConflict?: boolean;
}

export interface CalculateRouteOptions {
  arrivalTime?: Date | string | null;
  departureTime?: Date | string | null;
  prevEventEnd?: Date | string | null;
  targetEventStart?: Date | string | null;
  excludeEventId?: number;
  checkConflicts?: boolean;
}

export const TRAVEL_MODE_INFO: Record<TravelMode, { label: string; icon: string }> = {
  driving: { label: "Auto", icon: "🚗" },
  transit: { label: "Bahn / ÖPNV", icon: "🚆" },
  bicycling: { label: "Fahrrad", icon: "🚲" },
  walking: { label: "Zu Fuß", icon: "🚶" }
};

export function getGermanTimeContext(date: Date = new Date()) {
  const timeZone = "Europe/Berlin";
  const formatter = new Intl.DateTimeFormat("de-DE", {
    timeZone,
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZoneName: "short"
  });
  const parts = formatter.formatToParts(date);
  const partMap = Object.fromEntries(parts.map(p => [p.type, p.value]));

  const utcDate = new Date(date.toLocaleString("en-US", { timeZone: "UTC" }));
  const tzDate = new Date(date.toLocaleString("en-US", { timeZone }));
  const offsetMinutes = Math.round((tzDate.getTime() - utcDate.getTime()) / 60000);
  const offsetHours = Math.floor(Math.abs(offsetMinutes) / 60);
  const offsetMins = Math.abs(offsetMinutes) % 60;
  const sign = offsetMinutes >= 0 ? "+" : "-";
  const offsetStr = sign + String(offsetHours).padStart(2, "0") + ":" + String(offsetMins).padStart(2, "0");

  const isoDate = tzDate.getFullYear() + "-" + String(tzDate.getMonth() + 1).padStart(2, "0") + "-" + String(tzDate.getDate()).padStart(2, "0");
  const timeStr = String(tzDate.getHours()).padStart(2, "0") + ":" + String(tzDate.getMinutes()).padStart(2, "0");
  const dateString = date.toLocaleDateString("de-DE", { timeZone, weekday: "long", year: "numeric", month: "long", day: "numeric" });

  return {
    dateString,
    timeString: timeStr,
    todayIso: isoDate,
    offsetStr,
    tzName: partMap.timeZoneName || (offsetMinutes === 120 ? "MESZ" : "MEZ")
  };
}

export function parseFlexibleDate(val: Date | string | null | undefined, baseDate?: Date): Date | null {
  if (!val) return null;
  if (val instanceof Date) return isNaN(val.getTime()) ? null : val;
  const str = String(val).trim();
  if (!str) return null;

  // 1. Reine Uhrzeit: z. B. '16:00', '16:00 Uhr', '16:00:00'
  const timeOnlyMatch = str.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?(?:\s*uhr)?$/i);
  if (timeOnlyMatch) {
    const h = parseInt(timeOnlyMatch[1], 10);
    const m = parseInt(timeOnlyMatch[2], 10);
    const s = timeOnlyMatch[3] ? parseInt(timeOnlyMatch[3], 10) : 0;
    const d = new Date(baseDate || new Date());
    d.setHours(h, m, s, 0);
    return d;
  }

  // 2. Reines Datum: z. B. '2026-10-08'
  const dateOnlyMatch = str.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (dateOnlyMatch) {
    const year = parseInt(dateOnlyMatch[1], 10);
    const month = parseInt(dateOnlyMatch[2], 10) - 1;
    const day = parseInt(dateOnlyMatch[3], 10);
    return new Date(year, month, day, 0, 0, 0, 0);
  }

  // 3. Datum + Uhrzeit ohne Zeitzone oder mit einfachem 'Z' (LLM-Artefakt ohne Millisekunden):
  // z.B. '2026-10-08T16:00:00', '2026-10-08 16:00', '2026-10-08T16:00:00Z', '2026-10-08T16:00Z'
  const dtNoTzMatch = str.match(/^(\d{4})-(\d{2})-(\d{2})[T\s](\d{1,2}):(\d{2})(?::(\d{2}))?Z?$/i);
  if (dtNoTzMatch) {
    const year = parseInt(dtNoTzMatch[1], 10);
    const month = parseInt(dtNoTzMatch[2], 10) - 1;
    const day = parseInt(dtNoTzMatch[3], 10);
    const h = parseInt(dtNoTzMatch[4], 10);
    const m = parseInt(dtNoTzMatch[5], 10);
    const s = dtNoTzMatch[6] ? parseInt(dtNoTzMatch[6], 10) : 0;
    return new Date(year, month, day, h, m, s, 0);
  }

  // 4. Standard Date fallback (für ISO-Strings mit Millisekunden .000Z oder explizitem Offset wie +02:00)
  const d = new Date(str);
  return isNaN(d.getTime()) ? null : d;
}

export function formatGermanTime(date: Date): string {
  return date.toLocaleTimeString("de-DE", { timeZone: "Europe/Berlin", hour: "2-digit", minute: "2-digit" });
}

export function formatGermanDate(date: Date): string {
  return date.toLocaleDateString("de-DE", { timeZone: "Europe/Berlin", day: "2-digit", month: "2-digit", year: "numeric" });
}

function getVehicleIcon(type?: string, name?: string): string {
  const t = (type || "").toUpperCase();
  const n = (name || "").toLowerCase();
  if (t === "SUBWAY" || t === "METRO" || n.includes("u-bahn") || n.includes("metro")) return "🚇";
  if (t === "BUS" || n.includes("bus")) return "🚌";
  if (t === "TRAM" || n.includes("tram") || n.includes("straßenbahn")) return "🚊";
  if (t === "FERRY" || n.includes("fähre")) return "⛴️";
  if (t === "HIGH_SPEED_TRAIN" || t === "HEAVY_RAIL" || t === "INTERCITY" || n.includes("ice") || n.includes("ic") || n.includes("re") || n.includes("rb") || n.includes("zug")) return "🚆";
  if (t === "COMMUTER_TRAIN" || n.includes("s-bahn")) return "🚆";
  return "🚆";
}

export class RouteService {
  /**
   * Normalisiert einen Standort-String für konsistente Cache-Schlüssel
   */
  static normalizeLocation(loc: string): string {
    return (loc || "")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, " ");
  }

  /**
   * Generiert einen offiziellen Google Maps Navigationslink
   */
  static buildGoogleMapsUrl(origin: string, destination: string, travelMode: string = "driving"): string {
    const encOrigin = encodeURIComponent(origin.trim());
    const encDest = encodeURIComponent(destination.trim());
    const mode = travelMode.toLowerCase();
    return `https://www.google.com/maps/dir/?api=1&origin=${encOrigin}&destination=${encDest}&travelmode=${mode}`;
  }

  /**
   * Berechnet eine Route zwischen zwei Orten.
   * Bei transit (Bahn/ÖPNV) wird immer die konkrete Uhrzeit der Termine berücksichtigt,
   * um den genauen Fahrplan, Abfahrts-, Ankunftszeiten und Pausen vor und nachher zu ermitteln.
   */
  static async calculateRoute(
    origin: string,
    destination: string,
    travelMode: TravelMode = "driving",
    prisma: PrismaClient,
    options?: CalculateRouteOptions
  ): Promise<RouteResult> {
    const targetArrivalDate = parseFlexibleDate(options?.arrivalTime || options?.targetEventStart);
    const targetDepartureDate = parseFlexibleDate(options?.departureTime);
    const prevEventEndDate = parseFlexibleDate(options?.prevEventEnd);

    const refDate = targetDepartureDate || targetArrivalDate || undefined;
    const resolvedOrigin = await this.resolveLocation(origin, prisma, true, refDate);
    const resolvedDest = await this.resolveLocation(destination, prisma, false, refDate);

    const rawOrigin = resolvedOrigin || (origin || "").trim();
    const rawDest = resolvedDest || (destination || "").trim();

    if (!rawOrigin || !rawDest) {
      throw new Error("Start- und Zielort müssen angegeben werden.");
    }

    const normOrigin = this.normalizeLocation(rawOrigin);
    const normDest = this.normalizeLocation(rawDest);
    const mode = travelMode || "driving";

    // 1. ZUERST IM CACHE PRÜFEN (Kostensparend für Auto, Fahrrad, Fußweg)
    // Bei transit (ÖPNV) wird der statische Cache NICHT verwendet, da Fahrpläne uhrzeitabhängig sind!
    if (mode !== "transit") {
      try {
        const cached = await prisma.routeCache.findUnique({
          where: {
            origin_destination_travelMode: {
              origin: normOrigin,
              destination: normDest,
              travelMode: mode
            }
          }
        });

        if (cached) {
          let journeyStartDateTime: string | null = null;
          let journeyEndDateTime: string | null = null;
          let journeyStartTime: string | null = null;
          let journeyEndTime: string | null = null;
          let pauseBeforeMinutes: number | null = null;
          let pauseAfterMinutes: number | null = null;

          if (targetArrivalDate) {
            const arrMs = targetArrivalDate.getTime();
            const bufferMins = mode === "driving" ? 5 : 0;
            const jEndMs = arrMs - bufferMins * 60000;
            const jStartMs = jEndMs - cached.durationMinutes * 60000;
            journeyStartDateTime = new Date(jStartMs).toISOString();
            journeyEndDateTime = new Date(jEndMs).toISOString();
            journeyStartTime = formatGermanTime(new Date(jStartMs));
            journeyEndTime = formatGermanTime(new Date(jEndMs));

            if (prevEventEndDate) {
              pauseBeforeMinutes = Math.round((jStartMs - prevEventEndDate.getTime()) / 60000);
            }
            pauseAfterMinutes = Math.round((arrMs - jEndMs) / 60000);
          }

          let calendarConflicts: CalendarConflictInfo[] = [];
          let hasCalendarConflict = false;
          if (options?.checkConflicts !== false) {
            const tStart = journeyStartDateTime ? new Date(journeyStartDateTime) : (targetDepartureDate || new Date());
            const tEnd = journeyEndDateTime ? new Date(journeyEndDateTime) : new Date(tStart.getTime() + cached.durationMinutes * 60000);
            const conflictCheck = await this.checkCalendarConflicts(tStart, tEnd, prisma, {
              excludeEventId: options?.excludeEventId
            });
            calendarConflicts = conflictCheck.conflicts;
            hasCalendarConflict = conflictCheck.hasConflict;
          }

          return {
            origin: rawOrigin,
            destination: rawDest,
            travelMode: cached.travelMode,
            durationMinutes: cached.durationMinutes,
            durationText: cached.durationText,
            distanceMeters: cached.distanceMeters,
            distanceText: cached.distanceText,
            summary: cached.summary,
            googleMapsUrl: cached.googleMapsUrl || this.buildGoogleMapsUrl(rawOrigin, rawDest, mode),
            transitDetails: null,
            fromCache: true,
            departureTime: journeyStartTime,
            arrivalTime: journeyEndTime,
            journeyStartTime,
            journeyEndTime,
            journeyStartDateTime,
            journeyEndDateTime,
            pauseBeforeMinutes,
            pauseAfterMinutes,
            alternatives: [],
            calendarConflicts,
            hasCalendarConflict
          };
        }
      } catch (cacheReadErr) {
        console.warn("[RouteService] Fehler beim Lesen des RouteCache:", cacheReadErr);
      }
    }

    // 2. Google Routes API aufrufen
    const apiKey = process.env.GOOGLE_MAPS_API_KEY || process.env.GOOGLE_API_KEY;
    const timeContext = { targetArrivalDate, targetDepartureDate, prevEventEndDate };

    if (apiKey) {
      try {
        const routesMode = mode === "driving" ? "DRIVE" : mode === "transit" ? "TRANSIT" : mode === "bicycling" ? "BICYCLE" : "WALK";
        const fieldMask = mode === "transit"
          ? "routes.duration,routes.distanceMeters,routes.description,routes.legs.steps.transitDetails,routes.legs.steps.navigationInstruction,routes.legs.steps.travelMode,routes.legs.steps.localizedValues"
          : "routes.duration,routes.distanceMeters,routes.description";

        const requestBody: any = {
          origin: { address: rawOrigin },
          destination: { address: rawDest },
          travelMode: routesMode,
          computeAlternativeRoutes: true,
          languageCode: "de"
        };

        if (mode === "transit") {
          if (targetArrivalDate) {
            requestBody.arrivalTime = targetArrivalDate.toISOString();
          } else if (targetDepartureDate) {
            requestBody.departureTime = targetDepartureDate.toISOString();
          } else {
            requestBody.departureTime = new Date().toISOString();
          }
        }

        const routesRes = await fetch("https://routes.googleapis.com/directions/v2:computeRoutes", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Goog-Api-Key": apiKey,
            "X-Goog-FieldMask": fieldMask
          },
          body: JSON.stringify(requestBody)
        });

        if (routesRes.ok) {
          const rData: any = await routesRes.json();
          if (rData && rData.routes && rData.routes.length > 0) {
            const primaryRoute = this.parseSingleRouteOption(rData.routes[0], mode, rawOrigin, rawDest, timeContext);
            const alternatives: RouteResult[] = [];

            for (let i = 1; i < rData.routes.length; i++) {
              if (alternatives.length >= 2) break;
              const cand = this.parseSingleRouteOption(rData.routes[i], mode, rawOrigin, rawDest, timeContext);

              const isDuplicateOfPrimary =
                cand.durationMinutes === primaryRoute.durationMinutes &&
                cand.departureTime === primaryRoute.departureTime &&
                (cand.transitDetails?.lines || []).join(",") === (primaryRoute.transitDetails?.lines || []).join(",");

              const isDuplicateOfAlt = alternatives.some(alt =>
                alt.durationMinutes === cand.durationMinutes &&
                alt.departureTime === cand.departureTime &&
                (alt.transitDetails?.lines || []).join(",") === (cand.transitDetails?.lines || []).join(",")
              );

              if (!isDuplicateOfPrimary && !isDuplicateOfAlt) {
                alternatives.push(cand);
              }
            }

            // Kalenderkollisionsprüfung für Hauptroute und Alternativen
            if (options?.checkConflicts !== false) {
              const allRoutesToVerify = [primaryRoute, ...alternatives];
              for (const rItem of allRoutesToVerify) {
                const tStart = rItem.journeyStartDateTime
                  ? new Date(rItem.journeyStartDateTime)
                  : (targetDepartureDate || (targetArrivalDate ? new Date(targetArrivalDate.getTime() - rItem.durationMinutes * 60000) : new Date()));
                const tEnd = rItem.journeyEndDateTime
                  ? new Date(rItem.journeyEndDateTime)
                  : (targetArrivalDate || new Date(tStart.getTime() + rItem.durationMinutes * 60000));

                const conflictCheck = await this.checkCalendarConflicts(tStart, tEnd, prisma, {
                  excludeEventId: options?.excludeEventId
                });
                rItem.calendarConflicts = conflictCheck.conflicts;
                rItem.hasCalendarConflict = conflictCheck.hasConflict;
              }
            }

            primaryRoute.alternatives = alternatives;

            // Speichern im RouteCache für Auto/Fahrrad/Fußweg
            if (mode !== "transit") {
              try {
                await prisma.routeCache.upsert({
                  where: { origin_destination_travelMode: { origin: normOrigin, destination: normDest, travelMode: mode } },
                  update: {
                    durationMinutes: primaryRoute.durationMinutes,
                    durationText: primaryRoute.durationText,
                    distanceMeters: primaryRoute.distanceMeters,
                    distanceText: primaryRoute.distanceText,
                    summary: primaryRoute.summary,
                    googleMapsUrl: primaryRoute.googleMapsUrl
                  },
                  create: {
                    origin: normOrigin,
                    destination: normDest,
                    travelMode: mode,
                    durationMinutes: primaryRoute.durationMinutes,
                    durationText: primaryRoute.durationText,
                    distanceMeters: primaryRoute.distanceMeters,
                    distanceText: primaryRoute.distanceText,
                    summary: primaryRoute.summary,
                    googleMapsUrl: primaryRoute.googleMapsUrl
                  }
                });
              } catch (cacheWriteErr) {
                console.warn("[RouteService] Fehler beim Speichern im RouteCache:", cacheWriteErr);
              }
            }

            return primaryRoute;
          }
        }
      } catch (rErr) {
        console.warn("[RouteService] Fehler bei Google Routes API v2:", rErr);
      }
    }

    // 3. Fallback, falls Google API nicht erreichbar oder Deaktiviert
    const estimates: Record<TravelMode, { mins: number; text: string; distText: string; summary: string }> = {
      driving: { mins: 20, text: "ca. 20 Min.", distText: "ca. 10 km", summary: "Straßenverkehr" },
      transit: { mins: 28, text: "ca. 28 Min.", distText: "ca. 9 km", summary: "ÖPNV / Bahn" },
      bicycling: { mins: 32, text: "ca. 32 Min.", distText: "ca. 8 km", summary: "Fahrradroute" },
      walking: { mins: 45, text: "ca. 45 Min.", distText: "ca. 3,5 km", summary: "Fußweg" }
    };

    const est = estimates[mode as TravelMode] || estimates.driving;
    const durationMinutes = est.mins;
    const durationText = est.text;
    const distanceText = est.distText;
    const summary = est.summary;

    let journeyStartDateTime: string | null = null;
    let journeyEndDateTime: string | null = null;
    let journeyStartTime: string | null = null;
    let journeyEndTime: string | null = null;
    let pauseBeforeMinutes: number | null = null;
    let pauseAfterMinutes: number | null = null;

    if (targetArrivalDate) {
      const arrMs = targetArrivalDate.getTime();
      const bufferMins = mode === "transit" ? 5 : mode === "driving" ? 5 : 0;
      const jEndMs = arrMs - bufferMins * 60000;
      const jStartMs = jEndMs - durationMinutes * 60000;
      journeyStartDateTime = new Date(jStartMs).toISOString();
      journeyEndDateTime = new Date(jEndMs).toISOString();
      journeyStartTime = formatGermanTime(new Date(jStartMs));
      journeyEndTime = formatGermanTime(new Date(jEndMs));

      if (prevEventEndDate) {
        pauseBeforeMinutes = Math.round((jStartMs - prevEventEndDate.getTime()) / 60000);
      }
      pauseAfterMinutes = Math.round((arrMs - jEndMs) / 60000);
    } else if (targetDepartureDate) {
      const depMs = targetDepartureDate.getTime();
      journeyStartDateTime = new Date(depMs).toISOString();
      journeyEndDateTime = new Date(depMs + durationMinutes * 60000).toISOString();
      journeyStartTime = formatGermanTime(new Date(depMs));
      journeyEndTime = formatGermanTime(new Date(depMs + durationMinutes * 60000));
    }

    const fallbackTransit: TransitDetails | null = mode === "transit" ? {
      departureTime: journeyStartTime || "12:00",
      arrivalTime: journeyEndTime || "12:28",
      departureDateTime: journeyStartDateTime || undefined,
      arrivalDateTime: journeyEndDateTime || undefined,
      departureStop: rawOrigin,
      arrivalStop: rawDest,
      journeyStartTime: journeyStartTime || undefined,
      journeyEndTime: journeyEndTime || undefined,
      journeyStartDateTime: journeyStartDateTime || undefined,
      journeyEndDateTime: journeyEndDateTime || undefined,
      pauseBeforeMinutes,
      pauseAfterMinutes,
      durationText,
      transfersCount: 0,
      totalTransferWaitMinutes: 0,
      lines: ["ÖPNV"],
      steps: [
        {
          type: "transit",
          lineName: "ÖPNV / Bahn",
          vehicleName: "Bahn",
          vehicleIcon: "🚆",
          departureStop: rawOrigin,
          arrivalStop: rawDest,
          departureTime: journeyStartTime || "12:00",
          arrivalTime: journeyEndTime || "12:28",
          headsign: `Richtung ${rawDest}`,
          stopCount: 5
        }
      ]
    } : null;

    const fallbackPrimary: RouteResult = {
      origin: rawOrigin,
      destination: rawDest,
      travelMode: mode,
      durationMinutes,
      durationText,
      distanceMeters: 5000,
      distanceText,
      summary,
      googleMapsUrl: this.buildGoogleMapsUrl(rawOrigin, rawDest, mode),
      transitDetails: fallbackTransit,
      fromCache: false,
      departureTime: fallbackTransit?.departureTime || journeyStartTime,
      arrivalTime: fallbackTransit?.arrivalTime || journeyEndTime,
      journeyStartTime,
      journeyEndTime,
      journeyStartDateTime,
      journeyEndDateTime,
      pauseBeforeMinutes,
      pauseAfterMinutes,
      alternatives: []
    };

    if (options?.checkConflicts !== false) {
      const tStart = fallbackPrimary.journeyStartDateTime ? new Date(fallbackPrimary.journeyStartDateTime) : (targetDepartureDate || new Date());
      const tEnd = fallbackPrimary.journeyEndDateTime ? new Date(fallbackPrimary.journeyEndDateTime) : new Date(tStart.getTime() + fallbackPrimary.durationMinutes * 60000);
      const conflictCheck = await this.checkCalendarConflicts(tStart, tEnd, prisma, { excludeEventId: options?.excludeEventId });
      fallbackPrimary.calendarConflicts = conflictCheck.conflicts;
      fallbackPrimary.hasCalendarConflict = conflictCheck.hasConflict;
    }

    return fallbackPrimary;
  }

  /**
   * Parst eine einzelne Google Routes Option in ein standardisiertes RouteResult-Objekt
   */
  private static parseSingleRouteOption(
    r: any,
    mode: TravelMode,
    rawOrigin: string,
    rawDest: string,
    timeContext: {
      targetArrivalDate: Date | null;
      targetDepartureDate: Date | null;
      prevEventEndDate: Date | null;
    }
  ): RouteResult {
    const sec = parseInt((r.duration || "1200s").replace("s", ""), 10) || 1200;
    const durationMinutes = Math.max(1, Math.round(sec / 60));
    const durationText = `${durationMinutes} Min.`;
    const distanceMeters = r.distanceMeters || null;
    const distanceText = distanceMeters ? `${(distanceMeters / 1000).toFixed(1)} km` : null;
    let summary = r.description || null;
    const googleMapsUrl = this.buildGoogleMapsUrl(rawOrigin, rawDest, mode);

    let transitDetails: TransitDetails | null = null;
    let journeyStartDateTime: string | null = null;
    let journeyEndDateTime: string | null = null;
    let journeyStartTime: string | null = null;
    let journeyEndTime: string | null = null;
    let pauseBeforeMinutes: number | null = null;
    let pauseAfterMinutes: number | null = null;

    if (mode === "transit" && r.legs?.[0]?.steps) {
      transitDetails = this.parseRoutesApiTransitSteps(r.legs[0].steps, durationText, {
        targetArrivalDate: timeContext.targetArrivalDate,
        targetDepartureDate: timeContext.targetDepartureDate,
        prevEventEndDate: timeContext.prevEventEndDate
      });
      journeyStartDateTime = transitDetails.journeyStartDateTime || null;
      journeyEndDateTime = transitDetails.journeyEndDateTime || null;
      journeyStartTime = transitDetails.journeyStartTime || null;
      journeyEndTime = transitDetails.journeyEndTime || null;
      pauseBeforeMinutes = transitDetails.pauseBeforeMinutes ?? null;
      pauseAfterMinutes = transitDetails.pauseAfterMinutes ?? null;
      if (!summary && transitDetails.lines.length > 0) {
        summary = transitDetails.lines.join(", ");
      }
    } else if (timeContext.targetArrivalDate) {
      const arrMs = timeContext.targetArrivalDate.getTime();
      const bufferMins = mode === "driving" ? 5 : 0;
      const jEndMs = arrMs - bufferMins * 60000;
      const jStartMs = jEndMs - durationMinutes * 60000;
      journeyStartDateTime = new Date(jStartMs).toISOString();
      journeyEndDateTime = new Date(jEndMs).toISOString();
      journeyStartTime = formatGermanTime(new Date(jStartMs));
      journeyEndTime = formatGermanTime(new Date(jEndMs));

      if (timeContext.prevEventEndDate) {
        pauseBeforeMinutes = Math.round((jStartMs - timeContext.prevEventEndDate.getTime()) / 60000);
      }
      pauseAfterMinutes = Math.round((arrMs - jEndMs) / 60000);
    } else if (timeContext.targetDepartureDate) {
      const depMs = timeContext.targetDepartureDate.getTime();
      const jStartMs = depMs;
      const jEndMs = depMs + durationMinutes * 60000;
      journeyStartDateTime = new Date(jStartMs).toISOString();
      journeyEndDateTime = new Date(jEndMs).toISOString();
      journeyStartTime = formatGermanTime(new Date(jStartMs));
      journeyEndTime = formatGermanTime(new Date(jEndMs));
    }

    const earliestDepartureTime = transitDetails?.earliestDepartureTime || timeContext.targetDepartureDate?.toISOString() || timeContext.prevEventEndDate?.toISOString() || null;
    const requestedDepartureTime = transitDetails?.requestedDepartureTime || timeContext.targetDepartureDate?.toISOString() || null;
    const targetArrivalTime = transitDetails?.targetArrivalTime || timeContext.targetArrivalDate?.toISOString() || null;
    const bufferBeforeMinutes = transitDetails?.bufferBeforeMinutes ?? pauseBeforeMinutes;

    return {
      origin: rawOrigin,
      destination: rawDest,
      travelMode: mode,
      durationMinutes,
      durationText,
      distanceMeters,
      distanceText,
      summary,
      googleMapsUrl,
      transitDetails,
      fromCache: false,
      departureTime: transitDetails?.departureTime || journeyStartTime,
      arrivalTime: transitDetails?.arrivalTime || journeyEndTime,
      journeyStartTime,
      journeyEndTime,
      journeyStartDateTime,
      journeyEndDateTime,
      earliestDepartureTime,
      requestedDepartureTime,
      targetArrivalTime,
      bufferBeforeMinutes,
      pauseBeforeMinutes,
      pauseAfterMinutes
    };
  }

  /**
   * Prüft das Zeitfenster einer Reise auf Terminkollisionen mit Kalenderterminen
   */
  static async checkCalendarConflicts(
    travelStart: Date | string | null,
    travelEnd: Date | string | null,
    prisma: PrismaClient,
    options?: {
      excludeEventId?: number;
    }
  ): Promise<{
    hasConflict: boolean;
    conflicts: CalendarConflictInfo[];
    summaryMessage: string;
  }> {
    if (!travelStart || !travelEnd) {
      return { hasConflict: false, conflicts: [], summaryMessage: "Keine Terminkollisionen (keine exakte Zeitangabe)." };
    }

    const start = new Date(travelStart);
    const end = new Date(travelEnd);

    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      return { hasConflict: false, conflicts: [], summaryMessage: "Keine Terminkollisionen (ungültige Zeitangabe)." };
    }

    // 15 Minuten Puffer vorher und nachher abfragen
    const rangeStart = new Date(start.getTime() - 15 * 60 * 1000);
    const rangeEnd = new Date(end.getTime() + 15 * 60 * 1000);

    const conflicts: CalendarConflictInfo[] = [];

    try {
      // 1. Normale Termine abfragen
      const dbEvents = await prisma.event.findMany({
        where: {
          isDeleted: false,
          start: { lte: rangeEnd },
          end: { gte: rangeStart }
        }
      });

      // 2. Wiederkehrende Termine abfragen
      const dbPatterns = await prisma.recurrencePattern.findMany({
        where: {
          isDeleted: false,
          originalStart: { lte: rangeEnd },
          OR: [
            { recurrenceEnd: null },
            { recurrenceEnd: { gte: rangeStart } }
          ]
        }
      });

      const patternIds = dbPatterns.map((p: any) => p.id);
      const overrides = patternIds.length > 0 ? await prisma.event.findMany({
        where: { recurrenceId: { in: patternIds } }
      }) : [];

      const occurrences: any[] = [];
      for (const pattern of dbPatterns) {
        const originalStart = new Date(pattern.originalStart);
        const originalEnd = new Date(pattern.originalEnd);
        const durationMs = originalEnd.getTime() - originalStart.getTime();
        const recurrenceType = pattern.recurrenceType;
        const recurrenceEnd = pattern.recurrenceEnd ? new Date(pattern.recurrenceEnd) : null;
        const limitDate = recurrenceEnd && recurrenceEnd < rangeEnd ? recurrenceEnd : rangeEnd;

        let cur = new Date(originalStart);
        let loops = 0;
        while (cur <= limitDate && loops < 366) {
          loops++;
          const occEnd = new Date(cur.getTime() + durationMs);
          if (occEnd >= rangeStart && cur <= rangeEnd) {
            const occStartMs = cur.getTime();
            const ov = overrides.find((o: any) =>
              o.recurrenceId === pattern.id &&
              o.originalOccurrenceDate &&
              new Date(o.originalOccurrenceDate).getTime() === occStartMs
            );
            if (!ov) {
              occurrences.push({
                id: `rec-${pattern.id}-${occStartMs}`,
                title: pattern.title,
                start: new Date(cur),
                end: occEnd,
                isAllDay: pattern.isAllDay
              });
            }
          }
          if (recurrenceType === "DAILY") cur.setDate(cur.getDate() + 1);
          else if (recurrenceType === "WEEKLY") cur.setDate(cur.getDate() + 7);
          else if (recurrenceType === "MONTHLY") cur.setMonth(cur.getMonth() + 1);
          else break;
        }
      }

      const allEvents = [...dbEvents, ...occurrences];

      for (const ev of allEvents) {
        if (options?.excludeEventId && ev.id === options.excludeEventId) continue;
        if (ev.isAllDay) continue; // Ganztägige Termine blockieren nicht stundenweise Einzelfahrten

        const evStart = new Date(ev.start);
        const evEnd = new Date(ev.end);

        // Direkte Überschneidung
        if (evStart < end && evEnd > start) {
          conflicts.push({
            eventId: ev.id,
            title: ev.title,
            start: formatGermanTime(evStart),
            end: formatGermanTime(evEnd),
            conflictType: "overlap",
            message: `Terminkollision mit "${ev.title}" (${formatGermanTime(evStart)} - ${formatGermanTime(evEnd)} Uhr). Die Reisezeit (${formatGermanTime(start)} - ${formatGermanTime(end)} Uhr) überschneidet sich mit diesem Termin!`
          });
        } else if (evEnd <= start && (start.getTime() - evEnd.getTime()) < 3 * 60 * 1000) {
          // Sehr knappe Abfahrt
          conflicts.push({
            eventId: ev.id,
            title: ev.title,
            start: formatGermanTime(evStart),
            end: formatGermanTime(evEnd),
            conflictType: "tight_buffer",
            message: `Sehr knappe Abfahrt: Vorheriger Termin "${ev.title}" endet erst um ${formatGermanTime(evEnd)} Uhr (nur ${Math.round((start.getTime() - evEnd.getTime()) / 60000)} Min. Puffer vor Abfahrt um ${formatGermanTime(start)} Uhr).`
          });
        }
      }
    } catch (e) {
      console.warn("[RouteService] Fehler bei Kalender-Kollisionsprüfung:", e);
    }

    const hasConflict = conflicts.some(c => c.conflictType === "overlap");
    let summaryMessage = "Keine Terminkollisionen gefunden.";
    if (conflicts.length > 0) {
      summaryMessage = conflicts.map(c => c.message).join(" ");
    }

    return {
      hasConflict,
      conflicts,
      summaryMessage
    };
  }

  /**
   * Extrahiert strukturierte ÖPNV-Verbindungsdetails aus Google Routes API v2 Steps
   * und berechnet die genauen Abfahrts-, Ankunfts- und Pausenzeiten.
   */
  private static parseRoutesApiTransitSteps(
    rawSteps: any[],
    durationText: string,
    timeContext?: { targetArrivalDate: Date | null; targetDepartureDate?: Date | null; prevEventEndDate: Date | null }
  ): TransitDetails {
    const steps: TransitStep[] = [];
    let pendingWalkDistMeters = 0;
    let pendingWalkSecs = 0;
    let pendingWalkInst: string[] = [];

    const flushWalk = (nextTargetName?: string) => {
      if (pendingWalkInst.length === 0) return;
      const mins = Math.max(1, Math.round(pendingWalkSecs / 60));
      const distText = pendingWalkDistMeters >= 1000
        ? `${(pendingWalkDistMeters / 1000).toFixed(1)} km`
        : `${pendingWalkDistMeters} m`;
      const label = nextTargetName ? `Fußweg zu ${nextTargetName}` : "Fußweg zum Ziel";
      steps.push({
        type: "walk",
        instruction: label,
        distanceText: distText,
        durationText: `${mins} Min.`
      });
      pendingWalkDistMeters = 0;
      pendingWalkSecs = 0;
      pendingWalkInst = [];
    };

    let prevTransitArrival: string | null = null;
    let prevArrivalStop: string | null = null;
    const lines: string[] = [];
    let firstDepText: string | undefined = undefined;
    let lastArrText: string | undefined = undefined;
    let firstDepIso: string | undefined = undefined;
    let lastArrIso: string | undefined = undefined;
    let firstDepStopName: string | undefined = undefined;
    let lastArrStopName: string | undefined = undefined;
    let transfersCount = 0;
    let totalTransferWaitMinutes = 0;

    let preWalkSecs = 0;
    let postWalkSecs = 0;
    let hasEncounteredTransit = false;

    for (let i = 0; i < rawSteps.length; i++) {
      const s = rawSteps[i];
      if (s.travelMode === "TRANSIT" && s.transitDetails) {
        hasEncounteredTransit = true;
        postWalkSecs = 0; // Reset nachfolgenden Fußweg

        const td = s.transitDetails;
        const depStop = td.stopDetails?.departureStop?.name || "Haltestelle";
        flushWalk(depStop);

        const lineName = td.transitLine?.nameShort || td.transitLine?.name || "Bahn";
        if (!lines.includes(lineName)) lines.push(lineName);

        const arrStop = td.stopDetails?.arrivalStop?.name || "Ziel";
        const stepDepIso = td.stopDetails?.departureTime || null;
        const stepArrIso = td.stopDetails?.arrivalTime || null;
        const depTime = td.localizedValues?.departureTime?.time?.text || (stepDepIso ? formatGermanTime(new Date(stepDepIso)) : "");
        const arrTime = td.localizedValues?.arrivalTime?.time?.text || (stepArrIso ? formatGermanTime(new Date(stepArrIso)) : "");
        const headsign = td.headsign || "";
        const vehicleName = td.transitLine?.vehicle?.name?.text || "Bahn";
        const vehicleType = td.transitLine?.vehicle?.type || "";
        const vehicleIcon = getVehicleIcon(vehicleType, vehicleName);
        const lineColor = td.transitLine?.color || null;
        const stopCount = td.stopCount || 0;

        if (!firstDepText && depTime) {
          firstDepText = depTime;
          firstDepIso = stepDepIso;
          firstDepStopName = depStop;
        }
        if (arrTime) {
          lastArrText = arrTime;
          lastArrIso = stepArrIso;
          lastArrStopName = arrStop;
        }

        let transferWaitMinutes: number | null = null;
        let transferAtStop: string | null = null;
        if (prevTransitArrival && stepDepIso) {
          try {
            const arrDate = new Date(prevTransitArrival);
            const depDate = new Date(stepDepIso);
            const diffMs = depDate.getTime() - arrDate.getTime();
            if (diffMs > 0) {
              transferWaitMinutes = Math.round(diffMs / 60000);
              totalTransferWaitMinutes += transferWaitMinutes;
              transferAtStop = prevArrivalStop || depStop;
              transfersCount++;
            }
          } catch (_) {}
        }

        steps.push({
          type: "transit",
          lineName,
          lineColor,
          vehicleName,
          vehicleType,
          vehicleIcon,
          headsign,
          departureStop: depStop,
          departureTime: depTime,
          departureDateTime: stepDepIso || undefined,
          arrivalStop: arrStop,
          arrivalTime: arrTime,
          arrivalDateTime: stepArrIso || undefined,
          stopCount,
          transferWaitMinutes,
          transferAtStop
        });

        prevTransitArrival = stepArrIso || null;
        prevArrivalStop = arrStop;
      } else if (s.travelMode === "WALK") {
        const distStr = s.localizedValues?.distance?.text || "0 m";
        let meters = 0;
        if (distStr.includes("km")) {
          meters = parseFloat(distStr.replace(",", ".")) * 1000;
        } else {
          meters = parseInt(distStr, 10) || 50;
        }
        pendingWalkDistMeters += meters;

        const durStr = s.localizedValues?.staticDuration?.text || "1 Minute";
        const mMatch = durStr.match(/(\d+)/);
        const mins = mMatch ? parseInt(mMatch[1], 10) : 1;
        const stepSecs = mins * 60;
        pendingWalkSecs += stepSecs;

        if (!hasEncounteredTransit) {
          preWalkSecs += stepSecs;
        } else {
          postWalkSecs += stepSecs;
        }

        if (s.navigationInstruction?.instructions) {
          pendingWalkInst.push(s.navigationInstruction.instructions);
        }
      }
    }

    flushWalk(undefined);

    // Berechne Gesamtreise (inklusive Fußweg zum/vom Bahnhof)
    let journeyStartDateTime: string | undefined = undefined;
    let journeyEndDateTime: string | undefined = undefined;
    let journeyStartTime: string | undefined = undefined;
    let journeyEndTime: string | undefined = undefined;
    let pauseBeforeMinutes: number | null = null;
    let pauseAfterMinutes: number | null = null;

    if (firstDepIso) {
      const fDepMs = new Date(firstDepIso).getTime();
      const jStartMs = fDepMs - preWalkSecs * 1000;
      journeyStartDateTime = new Date(jStartMs).toISOString();
      journeyStartTime = formatGermanTime(new Date(jStartMs));

      const baseEarlyMs = timeContext?.prevEventEndDate?.getTime() || timeContext?.targetDepartureDate?.getTime() || null;
      if (baseEarlyMs && jStartMs > baseEarlyMs) {
        pauseBeforeMinutes = Math.round((jStartMs - baseEarlyMs) / 60000);
      }
    }

    if (lastArrIso) {
      const lArrMs = new Date(lastArrIso).getTime();
      const jEndMs = lArrMs + postWalkSecs * 1000;
      journeyEndDateTime = new Date(jEndMs).toISOString();
      journeyEndTime = formatGermanTime(new Date(jEndMs));

      if (timeContext?.targetArrivalDate) {
        pauseAfterMinutes = Math.round((timeContext.targetArrivalDate.getTime() - jEndMs) / 60000);
      }
    }

    const earliestDepartureTime = timeContext?.targetDepartureDate?.toISOString() || timeContext?.prevEventEndDate?.toISOString() || undefined;
    const requestedDepartureTime = timeContext?.targetDepartureDate?.toISOString() || undefined;
    const targetArrivalTime = timeContext?.targetArrivalDate?.toISOString() || undefined;

    return {
      departureTime: firstDepText,
      arrivalTime: lastArrText,
      departureDateTime: firstDepIso,
      arrivalDateTime: lastArrIso,
      departureStop: firstDepStopName,
      arrivalStop: lastArrStopName,
      journeyStartTime,
      journeyEndTime,
      journeyStartDateTime,
      journeyEndDateTime,
      earliestDepartureTime,
      requestedDepartureTime,
      targetArrivalTime,
      bufferBeforeMinutes: pauseBeforeMinutes,
      pauseBeforeMinutes,
      pauseAfterMinutes,
      preWalkMinutes: Math.round(preWalkSecs / 60),
      postWalkMinutes: Math.round(postWalkSecs / 60),
      durationText,
      transfersCount,
      totalTransferWaitMinutes,
      lines,
      steps
    };
  }

  /**
   * Generiert eine smarte Empfehlung des Routenplaners für die Verkehrsmittelwahl
   */
  static getAiRecommendation(origin: string, destination: string, defaultSuggestion?: string): string {
    if (defaultSuggestion) return defaultSuggestion;
    const normA = origin.toLowerCase();
    const normB = destination.toLowerCase();

    // Gleiche Stadt / Fußnähe Hinweise
    if (normA.includes("berlin") || normB.includes("berlin") || normA.includes("hamburg") || normB.includes("hamburg") || normA.includes("münchen") || normB.includes("köln")) {
      return "🚆 Bahn/ÖPNV empfohlen (Stadtverkehr: vermeidet Stau & Parkplatzsuche).";
    }

    return "🚆 Bahn oder 🚗 Auto empfohlen, je nach Verkehrslage.";
  }

  /**
   * Ermittelt den hinterlegten Wohnsitz / Hauptstandort des Nutzers (Owner).
   */
  static async getUserHomeLocation(prisma: PrismaClient): Promise<string> {
    try {
      const owner = await prisma.person.findFirst({
        where: { isOwner: true, isDeleted: false },
        include: {
          locations: {
            where: { location: { isDeleted: false } },
            include: { location: true },
            orderBy: { isPrimary: "desc" }
          }
        }
      });
      if (owner && owner.locations.length > 0) {
        const prim = owner.locations[0].location;
        return prim.formattedAddress || prim.address || prim.name || "Zuhause";
      }
    } catch (e) {
      console.warn("[RouteService] Fehler beim Ermitteln des Heimatorts:", e);
    }
    return "Zuhause";
  }

  /**
   * Löst Ortsnamen, Kontakte (z.B. "Tom"), Adressen oder "Zuhause" / "Ich" in eine konkrete Adresse auf.
   */
  static async resolveLocation(
    query: string | undefined | null,
    prisma: PrismaClient,
    isStart: boolean = false,
    referenceTime?: Date
  ): Promise<string> {
    const trimmed = (query || "").trim();
    const lower = trimmed.toLowerCase();

    // 1. Prüfen auf Zuhause / Ich / Me / Leereingabe
    const isHomeQuery = !trimmed ||
      lower === "zuhause" ||
      lower === "nach hause" ||
      lower === "heim" ||
      lower === "heimweg" ||
      lower === "ich" ||
      lower === "me" ||
      lower === "home";

    if (isHomeQuery) {
      if (isStart && !trimmed && referenceTime) {
        // Falls Start gar nicht übergeben wurde, prüfen ob kurz vorher ein Termin am gleichen Tag stattfand
        const prevEv = await prisma.event.findFirst({
          where: {
            isDeleted: false,
            isCancelled: false,
            end: { lte: referenceTime }
          },
          orderBy: { end: "desc" }
        });
        if (prevEv && prevEv.location) {
          const pEnd = new Date(prevEv.end);
          const isSameDay = pEnd.toDateString() === referenceTime.toDateString();
          if (isSameDay) {
            return prevEv.location;
          }
        }
      }
      return await this.getUserHomeLocation(prisma);
    }

    // 2. Suche nach Person Alias (z. B. "Tom", "Mama")
    const personAlias = await prisma.personAlias.findFirst({
      where: { name: { equals: trimmed, mode: "insensitive" } },
      include: {
        person: {
          include: {
            locations: {
              where: { location: { isDeleted: false } },
              include: { location: true },
              orderBy: { isPrimary: "desc" }
            }
          }
        }
      }
    });
    if (personAlias?.person?.locations?.length) {
      const loc = personAlias.person.locations[0].location;
      return loc.formattedAddress || loc.address || trimmed;
    }

    // 3. Suche nach Person direkt
    const directPerson = await prisma.person.findFirst({
      where: {
        isDeleted: false,
        aliases: {
          some: { name: { equals: trimmed, mode: "insensitive" } }
        }
      },
      include: {
        locations: {
          where: { location: { isDeleted: false } },
          include: { location: true },
          orderBy: { isPrimary: "desc" }
        }
      }
    });
    if (directPerson?.locations?.length) {
      const loc = directPerson.locations[0].location;
      return loc.formattedAddress || loc.address || trimmed;
    }

    // 4. Suche nach Ort in Locations-Tabelle
    const dbLoc = await prisma.location.findFirst({
      where: { isDeleted: false, name: { equals: trimmed, mode: "insensitive" } }
    });
    if (dbLoc) {
      return dbLoc.formattedAddress || dbLoc.address || trimmed;
    }

    // 5. Query enthält "zuhause" oder "nach hause" (z. B. "Rückfahrt nach Hause")
    if (lower.includes("zuhause") || lower.includes("nach hause") || lower.includes("heimweg")) {
      return await this.getUserHomeLocation(prisma);
    }

    return trimmed;
  }

  /**
   * Prüft Termine eines Tages auf aufeinanderfolgende Ortswechsel
   * und erzeugt ggf. Benachrichtigungen vom Routenplaner Agenten.
   */
  static async checkAndPlanRoutesForDay(
    targetDate: Date,
    prisma: PrismaClient
  ): Promise<{ plannedPairs: number; newInquiries: number }> {
    const startOfDay = new Date(targetDate);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(targetDate);
    endOfDay.setHours(23, 59, 59, 999);

    const events = await prisma.event.findMany({
      where: {
        isDeleted: false,
        isCancelled: false,
        start: { lte: endOfDay },
        end: { gte: startOfDay }
      },
      orderBy: { start: "asc" }
    });

    const locatedEvents = events.filter(e => e.location && e.location.trim().length > 0);

    let plannedPairs = 0;
    let newInquiries = 0;

    const homeLoc = await this.getUserHomeLocation(prisma);

    // 0. Prüfe Anreise für den ERSTEN Termin des Tages von Zuhause
    if (locatedEvents.length > 0) {
      const ev0 = locatedEvents[0];
      const loc0 = (ev0.location || "").trim();
      const originLoc = (ev0.travelOriginLocation || homeLoc).trim();

      if (loc0 && this.normalizeLocation(loc0) !== this.normalizeLocation(originLoc)) {
        plannedPairs++;
        const startTime0Str = formatGermanTime(new Date(ev0.start));

        if (!ev0.travelMode) {
          const suggestion = ev0.travelAiSuggestion || this.getAiRecommendation(originLoc, loc0);
          if (!ev0.travelAiSuggestion || !ev0.travelOriginLocation) {
            await prisma.event.update({
              where: { id: ev0.id },
              data: {
                travelAiSuggestion: suggestion,
                travelOriginLocation: originLoc
              }
            });
          }

          const sourceId = `first-${ev0.id}`;
          const existingNotif = await prisma.agentNotification.findFirst({
            where: {
              sourceType: "route_planner",
              sourceId,
              isDismissed: false
            }
          });

          if (!existingNotif) {
            await prisma.agentNotification.create({
              data: {
                title: `🗺️ Route planen: Anreise zu "${ev0.title}"`,
                message: `Für deinen Termin **"${ev0.title}"** (📍 ${loc0}, Beginn: ${startTime0Str} Uhr) liegt eine Anreise von **${originLoc}** vor.\n\n💡 **Empfehlung des Routenplaners:** ${suggestion}\n\nWie möchtest du reisen?`,
                reasoning: `Anreise von "${originLoc}" nach "${loc0}" erfordert rechtzeitige Wegezeitplanung, um den Termin um ${startTime0Str} Uhr pünktlich zu erreichen.`,
                agentName: "Haupt-Assistent (Web / App)",
                agentAvatar: "🤖",
                agentColor: "#cba6f7",
                type: "question",
                priority: "high",
                sourceType: "route_planner",
                sourceId,
                actionData: {
                  actionType: "set_route_mode",
                  fromEventId: null,
                  toEventId: ev0.id,
                  origin: originLoc,
                  destination: loc0
                },
                buttons: [
                  { label: "🚗 Auto", action: "set_route_mode", replyText: "Auto", travelMode: "driving", style: "primary" },
                  { label: "🚆 Bahn / ÖPNV", action: "set_route_mode", replyText: "Bahn", travelMode: "transit", style: "primary" },
                  { label: "🚲 Fahrrad", action: "set_route_mode", replyText: "Fahrrad", travelMode: "bicycling", style: "secondary" },
                  { label: "🚶 Zu Fuß", action: "set_route_mode", replyText: "Zu Fuß", travelMode: "walking", style: "secondary" }
                ]
              }
            });
            newInquiries++;
          }
        } else {
          // Falls travelMode bereits gewählt wurde, aber Details oder Zeiten fehlen
          const existingTransit = (ev0.travelTransitDetails as any);
          const needsUpdate = !ev0.travelDurationMinutes ||
            (ev0.travelMode === 'transit' && (!existingTransit || !existingTransit.journeyStartDateTime)) ||
            !ev0.travelOriginLocation;

          if (needsUpdate) {
            try {
              const route = await this.calculateRoute(originLoc, loc0, ev0.travelMode as TravelMode, prisma, {
                arrivalTime: ev0.start,
                targetEventStart: ev0.start
              });
              await prisma.event.update({
                where: { id: ev0.id },
                data: {
                  travelDurationMinutes: route.durationMinutes,
                  travelDistanceText: route.distanceText,
                  travelOriginLocation: originLoc,
                  travelTransitDetails: (route.transitDetails as any) || (route.journeyStartDateTime ? {
                    journeyStartTime: route.journeyStartTime,
                    journeyEndTime: route.journeyEndTime,
                    journeyStartDateTime: route.journeyStartDateTime,
                    journeyEndDateTime: route.journeyEndDateTime,
                    pauseBeforeMinutes: route.pauseBeforeMinutes,
                    pauseAfterMinutes: route.pauseAfterMinutes,
                    durationMinutes: route.durationMinutes
                  } : undefined)
                }
              });
            } catch (e) {
              console.warn(`[RouteService] Fehler beim Nachberechnen der Route für Event #${ev0.id}:`, e);
            }
          }
        }
      }
    }

    for (let i = 0; i < locatedEvents.length - 1; i++) {
      const evA = locatedEvents[i];
      const evB = locatedEvents[i + 1];

      const locA = (evA.location || "").trim();
      const locB = (evB.location || "").trim();

      if (!locA || !locB) continue;

      if (this.normalizeLocation(locA) === this.normalizeLocation(locB)) continue;

      plannedPairs++;

      const startTimeStr = formatGermanTime(new Date(evB.start));
      const endTimeAStr = formatGermanTime(new Date(evA.end));

      // Wenn bei Event B noch kein travelMode gewählt wurde
      if (!evB.travelMode) {
        const suggestion = evB.travelAiSuggestion || this.getAiRecommendation(locA, locB);
        
        // Suggestion auf Event sichern
        if (!evB.travelAiSuggestion) {
          await prisma.event.update({
            where: { id: evB.id },
            data: { travelAiSuggestion: suggestion }
          });
        }

        // Prüfen, ob bereits eine offene Benachrichtigung existiert
        const sourceId = `${evA.id}-${evB.id}`;
        const existingNotif = await prisma.agentNotification.findFirst({
          where: {
            sourceType: "route_planner",
            sourceId,
            isDismissed: false
          }
        });

        if (!existingNotif) {
          await prisma.agentNotification.create({
            data: {
              title: `🗺️ Route planen: ${evA.title} ➔ ${evB.title}`,
              message: `Zwischen deinen Terminen **"${evA.title}"** (📍 ${locA}, Ende: ${endTimeAStr} Uhr) und **"${evB.title}"** (📍 ${locB}, Beginn: ${startTimeStr} Uhr) liegt ein Ortswechsel vor.\n\n💡 **Empfehlung des Routenplaners:** ${suggestion}\n\nWie möchtest du reisen?`,
              reasoning: `Ortswechsel von "${locA}" nach "${locB}" erfordert rechtzeitige Wegezeitplanung, um den Anschlusstermin um ${startTimeStr} Uhr pünktlich zu erreichen.`,
              agentName: "Haupt-Assistent (Web / App)",
              agentAvatar: "🤖",
              agentColor: "#cba6f7",
              type: "question",
              priority: "high",
              sourceType: "route_planner",
              sourceId,
              actionData: {
                actionType: "set_route_mode",
                fromEventId: evA.id,
                toEventId: evB.id,
                origin: locA,
                destination: locB
              },
              buttons: [
                { label: "🚗 Auto", action: "set_route_mode", replyText: "Auto", travelMode: "driving", style: "primary" },
                { label: "🚆 Bahn / ÖPNV", action: "set_route_mode", replyText: "Bahn", travelMode: "transit", style: "primary" },
                { label: "🚲 Fahrrad", action: "set_route_mode", replyText: "Fahrrad", travelMode: "bicycling", style: "secondary" },
                { label: "🚶 Zu Fuß", action: "set_route_mode", replyText: "Zu Fuß", travelMode: "walking", style: "secondary" }
              ]
            }
          });
          newInquiries++;
        }
      } else {
        // Falls travelMode bereits gewählt ist: prüfen ob Route aktuell ist (inkl. genauer Uhrzeiten & Pausen)
        const existingTransit = (evB.travelTransitDetails as any);
        const needsUpdate = !evB.travelDurationMinutes ||
          !existingTransit ||
          !existingTransit.journeyStartDateTime ||
          evB.travelOriginLocation !== locA;

        if (needsUpdate) {
          try {
            const route = await this.calculateRoute(locA, locB, evB.travelMode as TravelMode, prisma, {
              arrivalTime: evB.start,
              targetEventStart: evB.start,
              prevEventEnd: evA.end
            });
            await prisma.event.update({
              where: { id: evB.id },
              data: {
                travelDurationMinutes: route.durationMinutes,
                travelDistanceText: route.distanceText,
                travelOriginLocation: locA,
                travelTransitDetails: (route.transitDetails as any) || (route.journeyStartDateTime ? {
                  journeyStartTime: route.journeyStartTime,
                  journeyEndTime: route.journeyEndTime,
                  journeyStartDateTime: route.journeyStartDateTime,
                  journeyEndDateTime: route.journeyEndDateTime,
                  pauseBeforeMinutes: route.pauseBeforeMinutes,
                  pauseAfterMinutes: route.pauseAfterMinutes,
                  durationMinutes: route.durationMinutes
                } : undefined)
              }
            });
          } catch (e) {
            console.warn(`[RouteService] Fehler beim Nachberechnen der Route für Event #${evB.id}:`, e);
          }
        }
      }
    }

    // 2. Prüfe Termine ohne Ort oder mit unklarem Ort auf bekannte Kontakte & Wohnsitze
    const unlocatedEvents = events.filter(e => !e.location || !e.location.trim() || e.location.toLowerCase().startsWith("bei "));
    for (const ev of unlocatedEvents) {
      const titleMatch = ev.title.match(/(?:mit|bei|treffen mit|meeting mit)\s+([A-Za-zÄÖÜäöüß]+)/i);
      const locMatch = (ev.location || "").match(/(?:bei|zu)\s+([A-Za-zÄÖÜäöüß]+)/i);
      const candidateName = (locMatch ? locMatch[1] : titleMatch ? titleMatch[1] : null);

      if (candidateName) {
        try {
          const alias = await (prisma as any).personAlias.findUnique({
            where: { name: candidateName },
            include: {
              person: {
                include: {
                  locations: {
                    where: { location: { isDeleted: false } },
                    include: { location: true },
                    orderBy: { isPrimary: "desc" }
                  }
                }
              }
            }
          });

          if (alias && alias.person) {
            const personLocations = alias.person.locations;
            const sourceId = `unlocated-${ev.id}`;
            const existingNotif = await prisma.agentNotification.findFirst({
              where: { sourceType: "route_planner_location", sourceId, isDismissed: false }
            });

            if (!existingNotif) {
              if (personLocations.length > 0) {
                const bestLoc = personLocations[0].location;
                const addr = bestLoc.formattedAddress || bestLoc.name;
                await prisma.agentNotification.create({
                  data: {
                    title: `📍 Standort für "${ev.title}" übernehmen?`,
                    message: `Für deinen Termin **"${ev.title}"** ist noch kein genauer Standort hinterlegt. Soll ich die Adresse von ${alias.name} (**${addr}**) als Ort eintragen?`,
                    reasoning: `${alias.name} hat einen bekannten Wohnort ("${addr}"). Durch das Eintragen kann die Route und Wegezeit automatisch berechnet werden.`,
                    agentName: "Haupt-Assistent (Web / App)",
                    agentAvatar: "🤖",
                    agentColor: "#cba6f7",
                    type: "question",
                    priority: "normal",
                    sourceType: "route_planner_location",
                    sourceId,
                    actionData: {
                      actionType: "set_event_location",
                      eventId: ev.id,
                      location: addr
                    },
                    buttons: [
                      { label: `📍 Als Ort übernehmen`, action: "set_event_location", replyText: `Ort übernommen: ${addr}`, style: "primary" }
                    ]
                  }
                });
                newInquiries++;
              } else {
                await prisma.agentNotification.create({
                  data: {
                    title: `🗺️ Wo findet "${ev.title}" statt?`,
                    message: `Für deinen Termin **"${ev.title}"** (mit ${alias.name}) ist kein Standort hinterlegt und für ${alias.name} ist noch keine Adresse gespeichert.\n\nWo trefft ihr euch, damit ich die Route planen kann?`,
                    reasoning: `Ohne bekannten Standort kann keine Anreisezeit oder Routenführung berechnet werden.`,
                    agentName: "Haupt-Assistent (Web / App)",
                    agentAvatar: "🤖",
                    agentColor: "#cba6f7",
                    type: "question",
                    priority: "normal",
                    sourceType: "route_planner_location",
                    sourceId,
                    buttons: [
                      { label: "💬 Ort mitteilen", action: "open_chat", replyText: `Der Ort für ${ev.title} ist: `, style: "secondary" }
                    ]
                  }
                });
                newInquiries++;
              }
            }
          }
        } catch (subErr) {
          console.warn("[RouteService] Fehler beim Ermitteln des Kontakts für Event-Standort:", subErr);
        }
      }
    }

    return { plannedPairs, newInquiries };
  }

  /**
   * Setzt das gewählte Verkehrsmittel für einen Termin, berechnet die Route mit exakter Uhrzeit
   * und markiert zugehörige Benachrichtigungen als erledigt.
   */
  static async setEventTravelMode(
    eventId: number,
    fromLocation: string,
    travelMode: TravelMode,
    prisma: PrismaClient,
    options?: { prevEventEnd?: Date | string | null; targetEventStart?: Date | string | null }
  ): Promise<{ event: any; route: RouteResult }> {
    const event = await prisma.event.findUnique({
      where: { id: eventId }
    });

    if (!event || !event.location) {
      throw new Error(`Termin #${eventId} oder dessen Standort nicht gefunden.`);
    }

    // Vorherigen Termin am selben Tag vor event.start ermitteln (für die Pausenberechnung)
    let prevEnd = options?.prevEventEnd ? new Date(options.prevEventEnd) : null;
    if (!prevEnd) {
      const startOfDay = new Date(event.start);
      startOfDay.setHours(0, 0, 0, 0);
      const prevEvent = await prisma.event.findFirst({
        where: {
          isDeleted: false,
          isCancelled: false,
          start: { gte: startOfDay },
          end: { lte: event.start },
          location: { not: null }
        },
        orderBy: { end: "desc" }
      });
      if (prevEvent) {
        prevEnd = prevEvent.end;
      }
    }

    const route = await this.calculateRoute(fromLocation, event.location, travelMode, prisma, {
      arrivalTime: options?.targetEventStart || event.start,
      targetEventStart: options?.targetEventStart || event.start,
      prevEventEnd: prevEnd
    });

    const updatedEvent = await prisma.event.update({
      where: { id: eventId },
      data: {
        travelMode,
        travelDurationMinutes: route.durationMinutes,
        travelDistanceText: route.distanceText,
        travelOriginLocation: fromLocation,
        travelTransitDetails: (route.transitDetails as any) || (route.journeyStartDateTime ? {
          journeyStartTime: route.journeyStartTime,
          journeyEndTime: route.journeyEndTime,
          journeyStartDateTime: route.journeyStartDateTime,
          journeyEndDateTime: route.journeyEndDateTime,
          pauseBeforeMinutes: route.pauseBeforeMinutes,
          pauseAfterMinutes: route.pauseAfterMinutes,
          durationMinutes: route.durationMinutes
        } : undefined)
      }
    });

    // Zugehörige Routen-Benachrichtigung schließen
    try {
      await prisma.agentNotification.updateMany({
        where: {
          sourceType: "route_planner",
          sourceId: { contains: String(eventId) },
          isDismissed: false
        },
        data: {
          isDismissed: true,
          isRead: true,
          selectedButton: TRAVEL_MODE_INFO[travelMode]?.label || travelMode
        }
      });
    } catch (notifErr) {
      console.warn("[RouteService] Fehler beim Schließen der Notification:", notifErr);
    }

    return { event: updatedEvent, route };
  }
}

