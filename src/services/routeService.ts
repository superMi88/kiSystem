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
  pauseBeforeMinutes?: number | null;
  pauseAfterMinutes?: number | null;
  preWalkMinutes?: number;
  postWalkMinutes?: number;
  durationText?: string;
  transfersCount: number;
  lines: string[];
  steps: TransitStep[];
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
  pauseBeforeMinutes?: number | null;
  pauseAfterMinutes?: number | null;
}

export interface CalculateRouteOptions {
  arrivalTime?: Date | string | null;
  departureTime?: Date | string | null;
  prevEventEnd?: Date | string | null;
  targetEventStart?: Date | string | null;
}

export const TRAVEL_MODE_INFO: Record<TravelMode, { label: string; icon: string }> = {
  driving: { label: "Auto", icon: "🚗" },
  transit: { label: "Bahn / ÖPNV", icon: "🚆" },
  bicycling: { label: "Fahrrad", icon: "🚲" },
  walking: { label: "Zu Fuß", icon: "🚶" }
};

function formatGermanTime(date: Date): string {
  return date.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
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
    const rawOrigin = (origin || "").trim();
    const rawDest = (destination || "").trim();

    if (!rawOrigin || !rawDest) {
      throw new Error("Start- und Zielort müssen angegeben werden.");
    }

    const normOrigin = this.normalizeLocation(rawOrigin);
    const normDest = this.normalizeLocation(rawDest);
    const mode = travelMode || "driving";

    const targetArrivalDate = options?.arrivalTime
      ? new Date(options.arrivalTime)
      : options?.targetEventStart
      ? new Date(options.targetEventStart)
      : null;

    const targetDepartureDate = options?.departureTime
      ? new Date(options.departureTime)
      : null;

    const prevEventEndDate = options?.prevEventEnd
      ? new Date(options.prevEventEnd)
      : null;

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
            pauseAfterMinutes
          };
        }
      } catch (cacheReadErr) {
        console.warn("[RouteService] Fehler beim Lesen des RouteCache:", cacheReadErr);
      }
    }

    // 2. Google Routes API aufrufen
    const apiKey = process.env.GOOGLE_MAPS_API_KEY || process.env.GOOGLE_API_KEY;
    let durationMinutes = 20;
    let durationText = "20 Min.";
    let distanceMeters: number | null = 5000;
    let distanceText: string | null = "5 km";
    let summary: string | null = null;
    let transitDetails: TransitDetails | null = null;
    const googleMapsUrl = this.buildGoogleMapsUrl(rawOrigin, rawDest, mode);

    let journeyStartDateTime: string | null = null;
    let journeyEndDateTime: string | null = null;
    let journeyStartTime: string | null = null;
    let journeyEndTime: string | null = null;
    let pauseBeforeMinutes: number | null = null;
    let pauseAfterMinutes: number | null = null;

    let apiSuccess = false;

    if (apiKey) {
      // 2a. Moderne Google Routes API (v2)
      try {
        const routesMode = mode === "driving" ? "DRIVE" : mode === "transit" ? "TRANSIT" : mode === "bicycling" ? "BICYCLE" : "WALK";
        const fieldMask = mode === "transit"
          ? "routes.duration,routes.distanceMeters,routes.description,routes.legs.steps.transitDetails,routes.legs.steps.navigationInstruction,routes.legs.steps.travelMode,routes.legs.steps.localizedValues"
          : "routes.duration,routes.distanceMeters,routes.description";

        const requestBody: any = {
          origin: { address: rawOrigin },
          destination: { address: rawDest },
          travelMode: routesMode,
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
            const r = rData.routes[0];
            const sec = parseInt((r.duration || "1200s").replace("s", ""), 10) || 1200;
            durationMinutes = Math.max(1, Math.round(sec / 60));
            durationText = `${durationMinutes} Min.`;
            distanceMeters = r.distanceMeters || null;
            distanceText = distanceMeters ? `${(distanceMeters / 1000).toFixed(1)} km` : null;
            summary = r.description || null;
            apiSuccess = true;

            if (mode === "transit" && r.legs?.[0]?.steps) {
              transitDetails = this.parseRoutesApiTransitSteps(r.legs[0].steps, durationText, {
                targetArrivalDate,
                prevEventEndDate
              });
              journeyStartDateTime = transitDetails.journeyStartDateTime || null;
              journeyEndDateTime = transitDetails.journeyEndDateTime || null;
              journeyStartTime = transitDetails.journeyStartTime || null;
              journeyEndTime = transitDetails.journeyEndTime || null;
              pauseBeforeMinutes = transitDetails.pauseBeforeMinutes ?? null;
              pauseAfterMinutes = transitDetails.pauseAfterMinutes ?? null;
            }
          }
        }
      } catch (rErr) {
        console.warn("[RouteService] Fehler bei Google Routes API v2:", rErr);
      }
    }

    // 3. Fallback, falls Google API nicht erreichbar oder Deaktiviert
    if (!apiSuccess) {
      const estimates: Record<TravelMode, { mins: number; text: string; distText: string; summary: string }> = {
        driving: { mins: 20, text: "ca. 20 Min.", distText: "ca. 10 km", summary: "Straßenverkehr" },
        transit: { mins: 28, text: "ca. 28 Min.", distText: "ca. 9 km", summary: "ÖPNV / Bahn" },
        bicycling: { mins: 32, text: "ca. 32 Min.", distText: "ca. 8 km", summary: "Fahrradroute" },
        walking: { mins: 45, text: "ca. 45 Min.", distText: "ca. 3,5 km", summary: "Fußweg" }
      };

      const est = estimates[mode as TravelMode] || estimates.driving;
      durationMinutes = est.mins;
      durationText = est.text;
      distanceText = est.distText;
      summary = est.summary;

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
      }

      if (mode === "transit") {
        transitDetails = {
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
        };
      }
    } else if (mode !== "transit" && targetArrivalDate) {
      // Wenn API erfolgreich war für Auto/Rad/Fuß, Zeiten und Pausen berechnen
      const arrMs = targetArrivalDate.getTime();
      const bufferMins = mode === "driving" ? 5 : 0;
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
    }

    // 4. Im RouteCache speichern (NUR für driving, bicycling, walking - nicht für transit!)
    if (mode !== "transit") {
      try {
        await prisma.routeCache.upsert({
          where: {
            origin_destination_travelMode: {
              origin: normOrigin,
              destination: normDest,
              travelMode: mode
            }
          },
          update: {
            durationMinutes,
            durationText,
            distanceMeters,
            distanceText,
            summary,
            googleMapsUrl
          },
          create: {
            origin: normOrigin,
            destination: normDest,
            travelMode: mode,
            durationMinutes,
            durationText,
            distanceMeters,
            distanceText,
            summary,
            googleMapsUrl
          }
        });
      } catch (cacheWriteErr) {
        console.warn("[RouteService] Fehler beim Speichern im RouteCache:", cacheWriteErr);
      }
    }

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
      pauseBeforeMinutes,
      pauseAfterMinutes
    };
  }

  /**
   * Extrahiert strukturierte ÖPNV-Verbindungsdetails aus Google Routes API v2 Steps
   * und berechnet die genauen Abfahrts-, Ankunfts- und Pausenzeiten.
   */
  private static parseRoutesApiTransitSteps(
    rawSteps: any[],
    durationText: string,
    timeContext?: { targetArrivalDate: Date | null; prevEventEndDate: Date | null }
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

      if (timeContext?.prevEventEndDate) {
        pauseBeforeMinutes = Math.round((jStartMs - timeContext.prevEventEndDate.getTime()) / 60000);
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
      pauseBeforeMinutes,
      pauseAfterMinutes,
      preWalkMinutes: Math.round(preWalkSecs / 60),
      postWalkMinutes: Math.round(postWalkSecs / 60),
      durationText,
      transfersCount,
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
              agentName: "Routenplaner Agent",
              agentAvatar: "🗺️",
              agentColor: "#a6e3a1",
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

