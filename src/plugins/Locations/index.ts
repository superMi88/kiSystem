import { Plugin } from "../types.js";
import { SchemaType } from "@google/generative-ai";
import { RouteService, TravelMode, RouteResult, parseFlexibleDate, formatGermanTime } from "../../services/routeService.js";

export function buildFormattedAddress(loc: {
  address?: string | null;
  postalCode?: string | null;
  city?: string | null;
  state?: string | null;
  country?: string | null;
}): string {
  const parts: string[] = [];
  if (loc.address && loc.address.trim()) parts.push(loc.address.trim());
  const cityLine = [loc.postalCode, loc.city].filter(Boolean).map(s => String(s).trim()).join(" ");
  if (cityLine) parts.push(cityLine);
  if (loc.state && loc.state.trim() && (!loc.city || !loc.state.toLowerCase().includes(loc.city.toLowerCase()))) {
    parts.push(loc.state.trim());
  }
  if (loc.country && loc.country.trim() && loc.country.trim() !== "Deutschland") {
    parts.push(loc.country.trim());
  }
  return parts.join(", ");
}

/**
 * Findet Personen, die direkt mit einem Ort verknüpft sind,
 * ODER (falls der Ort ein Bundesland oder eine Stadt ist) über ihre Unter-Adressen dort wohnen.
 */
export async function getPersonsForLocation(prisma: any, location: any) {
  // 1. Direkt verknüpfte Personen
  const directLinks = await prisma.personLocation.findMany({
    where: {
      locationId: location.id,
      person: { isDeleted: false }
    },
    include: {
      person: {
        include: {
          aliases: true
        }
      }
    }
  });

  const personMap = new Map<number, any>();

  directLinks.forEach((pl: any) => {
    const p = pl.person;
    const primaryAlias = p.aliases.find((a: any) => a.isPrimary) || p.aliases[0];
    const name = primaryAlias ? primaryAlias.name : (p.isOwner ? "Ich" : `Person #${p.id}`);
    personMap.set(p.id, {
      id: p.id,
      name,
      relationType: pl.relationType,
      label: pl.label || (pl.relationType === "residence" ? "Wohnsitz" : pl.relationType === "work" ? "Arbeitsplatz" : pl.relationType),
      isPrimary: pl.isPrimary,
      isDirect: true,
      originLocationName: location.name
    });
  });

  // 2. Hierarchische Aggregation für Bundesländer oder Städte
  const isState = location.type === "state" || (!location.address && location.state && location.state.toLowerCase() === location.name.toLowerCase());
  const isCity = location.type === "city" || (!location.address && location.city && location.city.toLowerCase() === location.name.toLowerCase());

  if (isState || isCity) {
    const searchTerm = (isState ? (location.state || location.name) : (location.city || location.name)).trim();
    if (searchTerm) {
      const subLocations = await prisma.location.findMany({
        where: {
          id: { not: location.id },
          isDeleted: false,
          ...(isState ? { state: { contains: searchTerm, mode: "insensitive" } } : { city: { contains: searchTerm, mode: "insensitive" } })
        },
        include: {
          persons: {
            where: { person: { isDeleted: false } },
            include: {
              person: {
                include: { aliases: true }
              }
            }
          }
        }
      });

      subLocations.forEach((subLoc: any) => {
        subLoc.persons.forEach((pl: any) => {
          const p = pl.person;
          if (!personMap.has(p.id)) {
            const primaryAlias = p.aliases.find((a: any) => a.isPrimary) || p.aliases[0];
            const name = primaryAlias ? primaryAlias.name : (p.isOwner ? "Ich" : `Person #${p.id}`);
            personMap.set(p.id, {
              id: p.id,
              name,
              relationType: pl.relationType,
              label: `${pl.label || (pl.relationType === "residence" ? "Wohnort" : pl.relationType)} (${subLoc.name || subLoc.city})`,
              isPrimary: pl.isPrimary,
              isDirect: false,
              originLocationName: subLoc.name,
              originLocationId: subLoc.id,
              originCity: subLoc.city,
              originState: subLoc.state
            });
          }
        });
      });
    }
  }

  return Array.from(personMap.values());
}

export const locationsPlugin: Plugin = {
  name: "Locations",
  description: "Verwaltet Orte, Adressen, Städte und Bundesländer sowie deren N:N-Verknüpfungen mit Personen für Routenplanung und Standortsuche.",
  tools: [
    {
      definition: {
        name: "erstelle_ort",
        description: "Erstellt einen neuen Ort oder eine Adresse (z.B. Wohnsitz einer Person, Büro, Ferienhaus, Stadt, Bundesland) und kann ihn optional direkt mit einer Person verknüpfen.",
        parameters: {
          type: SchemaType.OBJECT,
          properties: {
            name: { type: SchemaType.STRING, description: "Bezeichnung des Ortes (z.B. 'Toms Wohnung', 'Büro Mitte', 'Ferienhaus Schwarzwald', 'Baden-Württemberg', 'Stuttgart')" },
            typ: { type: SchemaType.STRING, description: "Art des Ortes: 'residence' (Wohnsitz/Zuhause), 'office' (Arbeitsplatz/Büro), 'city' (Stadt), 'state' (Bundesland/Region), 'poi' (Treffpunkt/Lokal), 'other' (Sonstiges). Standard ist 'residence' oder 'address'." },
            strasse: { type: SchemaType.STRING, description: "Straße und Hausnummer (z.B. 'Musterstraße 12')" },
            plz: { type: SchemaType.STRING, description: "Postleitzahl (z.B. '70173')" },
            stadt: { type: SchemaType.STRING, description: "Stadt (z.B. 'Stuttgart')" },
            bundesland: { type: SchemaType.STRING, description: "Bundesland oder Region (z.B. 'Baden-Württemberg')" },
            land: { type: SchemaType.STRING, description: "Land (Standard: 'Deutschland')" },
            notizen: { type: SchemaType.STRING, description: "Notizen oder Hinweise (z.B. 'Klingel bei Müller, 2. OG')" },
            personId: { type: SchemaType.INTEGER, description: "Optionale ID einer Person, die mit diesem Ort verknüpft werden soll." },
            personName: { type: SchemaType.STRING, description: "Optionaler Name der Person, falls ID unbekannt ist." },
            beziehungsart: { type: SchemaType.STRING, description: "Beziehungsart der Person zum Ort: 'residence' (Hauptwohnsitz), 'work' (Arbeitsplatz), 'secondary' (Zweitwohnsitz), 'region' (Region/Heimat), 'other'." },
            beziehungsLabel: { type: SchemaType.STRING, description: "Freitext-Label für die Beziehung (z.B. 'Hauptwohnsitz', 'Ferienhaus', 'Zweigstelle')." },
            istPrimaer: { type: SchemaType.BOOLEAN, description: "Ob dieser Ort der primäre Wohnsitz der Person ist (true/false)." }
          },
          required: ["name"]
        } as any
      },
      handler: async (args, { prisma }) => {
        const {
          name,
          typ,
          strasse,
          plz,
          stadt,
          bundesland,
          land,
          notizen,
          personId: inputPersonId,
          personName,
          beziehungsart,
          beziehungsLabel,
          istPrimaer
        } = args;

        const formattedAddress = buildFormattedAddress({
          address: strasse,
          postalCode: plz,
          city: stadt,
          state: bundesland,
          country: land || "Deutschland"
        }) || name;

        const location = await prisma.location.create({
          data: {
            name: name.trim(),
            type: typ || (bundesland && !strasse ? "state" : stadt && !strasse ? "city" : "residence"),
            address: strasse ? strasse.trim() : null,
            postalCode: plz ? plz.trim() : null,
            city: stadt ? stadt.trim() : null,
            state: bundesland ? bundesland.trim() : null,
            country: (land ? land.trim() : "Deutschland"),
            formattedAddress,
            notes: notizen ? notizen.trim() : null
          }
        });

        let linkedPersonName: string | null = null;
        let pId: number | null = inputPersonId ? Number(inputPersonId) : null;

        if (!pId && personName) {
          const alias = await prisma.personAlias.findUnique({
            where: { name: personName.trim() },
            include: { person: true }
          });
          if (alias && alias.person && !alias.person.isDeleted) {
            pId = alias.person.id;
            linkedPersonName = alias.name;
          }
        }

        if (pId) {
          const relType = beziehungsart || "residence";
          if (istPrimaer) {
            await prisma.personLocation.updateMany({
              where: { personId: pId, relationType: relType },
              data: { isPrimary: false }
            });
          }

          await prisma.personLocation.upsert({
            where: {
              personId_locationId_relationType: {
                personId: pId,
                locationId: location.id,
                relationType: relType
              }
            },
            update: {
              label: beziehungsLabel || null,
              isPrimary: !!istPrimaer
            },
            create: {
              personId: pId,
              locationId: location.id,
              relationType: relType,
              label: beziehungsLabel || null,
              isPrimary: !!istPrimaer
            }
          });

          if (!linkedPersonName) {
            const p = await prisma.person.findUnique({
              where: { id: pId },
              include: { aliases: true }
            });
            if (p) {
              const primaryAlias = p.aliases.find((a: any) => a.isPrimary) || p.aliases[0];
              linkedPersonName = primaryAlias ? primaryAlias.name : (p.isOwner ? "Ich" : `Person #${p.id}`);
            }
          }
        }

        return {
          status: "success",
          locationId: location.id,
          name: location.name,
          address: formattedAddress,
          linkedPerson: linkedPersonName,
          message: `Ort "${location.name}" (${formattedAddress}) wurde erfolgreich angelegt${linkedPersonName ? ` und mit ${linkedPersonName} verknüpft` : ''}.`
        };
      }
    },
    {
      definition: {
        name: "suche_orte",
        description: "Sucht im System nach gespeicherten Orten, Adressen oder Städten anhand von Name, Adresse, Bundesland, Stadt oder Personenname.",
        parameters: {
          type: SchemaType.OBJECT,
          properties: {
            suchbegriff: { type: SchemaType.STRING, description: "Suchbegriff (z.B. 'Tom', 'Baden-Württemberg', 'Stuttgart', 'Musterstraße')" },
            typ: { type: SchemaType.STRING, description: "Optionaler Filter nach Typ: 'residence', 'office', 'city', 'state', 'poi', 'other'" },
            stadt: { type: SchemaType.STRING, description: "Optionaler Filter nach Stadt" },
            bundesland: { type: SchemaType.STRING, description: "Optionaler Filter nach Bundesland" },
            personName: { type: SchemaType.STRING, description: "Optional: Nur Orte, die mit dieser Person verknüpft sind" }
          },
          required: []
        } as any
      },
      handler: async (args, { prisma }) => {
        const { suchbegriff, typ, stadt, bundesland, personName } = args;

        let personFilterId: number | null = null;
        if (personName) {
          const alias = await prisma.personAlias.findUnique({
            where: { name: personName.trim() }
          });
          if (alias) personFilterId = alias.personId;
        }

        const where: any = { isDeleted: false };
        if (typ) where.type = typ;
        if (stadt) where.city = { contains: stadt.trim(), mode: "insensitive" };
        if (bundesland) where.state = { contains: bundesland.trim(), mode: "insensitive" };

        if (suchbegriff && suchbegriff.trim()) {
          const term = suchbegriff.trim();
          where.OR = [
            { name: { contains: term, mode: "insensitive" } },
            { address: { contains: term, mode: "insensitive" } },
            { city: { contains: term, mode: "insensitive" } },
            { state: { contains: term, mode: "insensitive" } },
            { postalCode: { contains: term, mode: "insensitive" } },
            { formattedAddress: { contains: term, mode: "insensitive" } },
            { notes: { contains: term, mode: "insensitive" } },
            {
              persons: {
                some: {
                  person: {
                    aliases: {
                      some: { name: { contains: term, mode: "insensitive" } }
                    }
                  }
                }
              }
            }
          ];
        }

        if (personFilterId) {
          where.persons = { some: { personId: personFilterId } };
        }

        const locations = await prisma.location.findMany({
          where,
          include: {
            persons: {
              where: { person: { isDeleted: false } },
              include: {
                person: {
                  include: { aliases: true }
                }
              }
            }
          },
          orderBy: { name: "asc" },
          take: 20
        });

        const results = await Promise.all(
          locations.map(async (loc: any) => {
            const allPersons = await getPersonsForLocation(prisma, loc);
            return {
              id: loc.id,
              name: loc.name,
              type: loc.type,
              address: loc.address,
              postalCode: loc.postalCode,
              city: loc.city,
              state: loc.state,
              formattedAddress: loc.formattedAddress || buildFormattedAddress(loc),
              notes: loc.notes,
              personen: allPersons.map(p => ({
                id: p.id,
                name: p.name,
                relationType: p.relationType,
                label: p.label,
                isPrimary: p.isPrimary,
                isDirect: p.isDirect
              }))
            };
          })
        );

        return {
          anzahl: results.length,
          orte: results
        };
      }
    },
    {
      definition: {
        name: "hole_person_orte",
        description: "Ermittelt alle bekannten Wohnsitze, Büros und Orte einer Person (z.B. wenn der Benutzer fragt 'Wo wohnt Tom?' oder sagt 'Ich treffe mich bei Tom').",
        parameters: {
          type: SchemaType.OBJECT,
          properties: {
            personId: { type: SchemaType.INTEGER, description: "ID der Person (bevorzugt verwenden)" },
            personName: { type: SchemaType.STRING, description: "Name oder Spitzname der Person" }
          },
          required: []
        } as any
      },
      handler: async (args, { prisma }) => {
        const { personId: inputPersonId, personName } = args;

        let pId: number | null = inputPersonId ? Number(inputPersonId) : null;
        let displayName = personName || "Person";

        if (!pId && personName) {
          const alias = await prisma.personAlias.findUnique({
            where: { name: personName.trim() },
            include: { person: { include: { aliases: true } } }
          });
          if (alias && alias.person && !alias.person.isDeleted) {
            pId = alias.person.id;
            const primaryAlias = alias.person.aliases.find((a: any) => a.isPrimary) || alias.person.aliases[0];
            displayName = primaryAlias ? primaryAlias.name : alias.name;
          }
        }

        if (!pId) {
          return {
            status: "not_found",
            message: `Person '${personName || inputPersonId}' wurde nicht im System gefunden.`
          };
        }

        const personLocations = await prisma.personLocation.findMany({
          where: {
            personId: pId,
            location: { isDeleted: false }
          },
          include: {
            location: true
          },
          orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }]
        });

        if (personLocations.length === 0) {
          return {
            status: "no_locations",
            personId: pId,
            personName: displayName,
            orte: [],
            message: `Für ${displayName} sind bisher keine Orte oder Wohnsitze hinterlegt. Frage den Benutzer bei Bedarf, wo ${displayName} wohnt.`
          };
        }

        const orte = personLocations.map((pl: any) => ({
          ortId: pl.location.id,
          name: pl.location.name,
          typ: pl.location.type,
          beziehungsart: pl.relationType,
          label: pl.label || (pl.relationType === "residence" ? "Wohnsitz" : pl.relationType),
          istPrimaer: pl.isPrimary,
          adresse: pl.location.formattedAddress || buildFormattedAddress(pl.location),
          strasse: pl.location.address,
          plz: pl.location.postalCode,
          stadt: pl.location.city,
          bundesland: pl.location.state,
          notizen: pl.location.notes
        }));

        const primaer = orte.find((o: any) => o.istPrimaer) || orte[0];

        return {
          status: "success",
          personId: pId,
          personName: displayName,
          gesamt: orte.length,
          primaereAdresse: primaer.adresse,
          primaererOrt: primaer,
          alleOrte: orte,
          message: `${displayName} hat ${orte.length} hinterlegte(n) Ort(e). Hauptadresse: "${primaer.adresse}" (${primaer.name}).`
        };
      }
    },
    {
      definition: {
        name: "verknuepfe_person_ort",
        description: "Verbindet eine Person mit einem existierenden Ort (z.B. als Wohnsitz, Arbeitsplatz oder Region).",
        parameters: {
          type: SchemaType.OBJECT,
          properties: {
            ortId: { type: SchemaType.INTEGER, description: "ID des Ortes" },
            personId: { type: SchemaType.INTEGER, description: "ID der Person" },
            personName: { type: SchemaType.STRING, description: "Alternativ: Name der Person" },
            beziehungsart: { type: SchemaType.STRING, description: "'residence' (Wohnsitz), 'work' (Arbeitsplatz), 'secondary' (Zweitwohnsitz), 'region' (Region/Bundesland), 'other'" },
            label: { type: SchemaType.STRING, description: "Optionales Label (z.B. 'Hauptwohnsitz', 'Ferienhaus', 'Büro')" },
            istPrimaer: { type: SchemaType.BOOLEAN, description: "Ob dies der primäre Ort/Wohnsitz ist" }
          },
          required: ["ortId"]
        } as any
      },
      handler: async (args, { prisma }) => {
        const { ortId, personId: inputPersonId, personName, beziehungsart, label, istPrimaer } = args;

        const loc = await prisma.location.findUnique({
          where: { id: Number(ortId) }
        });
        if (!loc || loc.isDeleted) {
          return { status: "error", message: `Ort mit ID ${ortId} wurde nicht gefunden.` };
        }

        let pId: number | null = inputPersonId ? Number(inputPersonId) : null;
        let displayName = personName || "Person";

        if (!pId && personName) {
          const alias = await prisma.personAlias.findUnique({
            where: { name: personName.trim() },
            include: { person: true }
          });
          if (alias && alias.person && !alias.person.isDeleted) {
            pId = alias.person.id;
            displayName = alias.name;
          }
        }

        if (!pId) {
          return { status: "error", message: "Person konnte nicht ermittelt werden." };
        }

        const relType = beziehungsart || "residence";

        if (istPrimaer) {
          await prisma.personLocation.updateMany({
            where: { personId: pId, relationType: relType },
            data: { isPrimary: false }
          });
        }

        await prisma.personLocation.upsert({
          where: {
            personId_locationId_relationType: {
              personId: pId,
              locationId: loc.id,
              relationType: relType
            }
          },
          update: {
            label: label || null,
            isPrimary: !!istPrimaer
          },
          create: {
            personId: pId,
            locationId: loc.id,
            relationType: relType,
            label: label || null,
            isPrimary: !!istPrimaer
          }
        });

        return {
          status: "success",
          message: `${displayName} wurde erfolgreich mit Ort "${loc.name}" verknüpft (${relType}).`
        };
      }
    },
    {
      definition: {
        name: "berechne_route",
        description: "Berechnet Reiserouten zwischen zwei Orten oder Kontakten (für Bahn/ÖPNV, Auto, Fahrrad oder Fußweg). Liefert bis zu 2 Routenoptionen zum Vergleichen von Fahrzeiten, Umstiegen und Wartezeiten und prüft automatisch auf Terminkollisionen mit bestehenden Kalenderterminen.",
        parameters: {
          type: SchemaType.OBJECT,
          properties: {
            start: { type: SchemaType.STRING, description: "Startadresse oder Name der Start-Person (z.B. 'Alexanderplatz 1, Berlin' oder 'Ich' / 'Zuhause'). Standard ist der eigene Wohnort/Zuhause." },
            ziel: { type: SchemaType.STRING, description: "Zieladresse oder Name der Ziel-Person (z.B. 'Tom' oder 'Musterstraße 42, Stuttgart')." },
            reisemittel: { type: SchemaType.STRING, description: "Verkehrsmittel: 'transit' (Standard: Bahn/ÖPNV), 'driving' (Auto), 'bicycling' (Fahrrad), 'walking' (Zu Fuß)." },
            abfahrtszeit: { type: SchemaType.STRING, description: "Optionale gewünschte Abfahrtszeit in deutscher Zeit (Europe/Berlin, z. B. '14:30' oder '2026-10-08T14:30:00'). Niemals in UTC umrechnen und kein 'Z' anhängen." },
            ankunftszeit: { type: SchemaType.STRING, description: "Optionale gewünschte Ankunftszeit am Ziel in deutscher Zeit (Europe/Berlin, z. B. '15:00' oder '2026-10-08T15:00:00'), wenn der Nutzer pünktlich ankommen muss. Niemals in UTC umrechnen und kein 'Z' anhängen." },
            zeigeAlternativen: { type: SchemaType.BOOLEAN, description: "Wenn true (Standard), werden 2 Routenoptionen zurückgegeben, um Umsteigezeiten, Abfahrten und Wartezeiten zu vergleichen." }
          },
          required: ["ziel"]
        } as any
      },
      handler: async (args, { prisma }) => {
        let { start, ziel, reisemittel, abfahrtszeit, ankunftszeit } = args;

        const calcOptions: any = {};
        let depD: Date | null = null;
        let arrD: Date | null = null;
        if (ankunftszeit) {
          arrD = parseFlexibleDate(ankunftszeit);
          if (arrD) calcOptions.arrivalTime = arrD;
        }
        if (abfahrtszeit) {
          depD = parseFlexibleDate(abfahrtszeit);
          if (depD) calcOptions.departureTime = depD;
        }

        start = await RouteService.resolveLocation(start, prisma, true, depD || arrD || undefined);
        ziel = await RouteService.resolveLocation(ziel, prisma, false, arrD || depD || undefined);

        const mode: TravelMode = (reisemittel as TravelMode) || "transit";

        const result = await RouteService.calculateRoute(start, ziel, mode, prisma, calcOptions);

        if (!result) {
          return {
            status: "error",
            start,
            ziel,
            message: `Route von "${start}" nach "${ziel}" konnte nicht berechnet werden.`
          };
        }

        const formatRouteItem = (r: RouteResult, label: string) => {
          const isTransit = r.travelMode === "transit";
          const dep = r.departureTime || r.journeyStartTime || "Sofort";
          const arr = r.arrivalTime || r.journeyEndTime || `in ${r.durationText}`;
          const transfers = isTransit ? (r.transitDetails?.transfersCount ?? 0) : 0;
          const waitMins = isTransit ? (r.transitDetails?.totalTransferWaitMinutes ?? 0) : 0;
          const lines = isTransit ? (r.transitDetails?.lines || []) : [];
          const hasConflict = !!r.hasCalendarConflict;
          const conflictMsg = hasConflict && r.calendarConflicts && r.calendarConflicts.length > 0
            ? r.calendarConflicts.map((c: any) => c.message).join(" ")
            : "Keine Terminkollision (Reisezeit ist im Kalender frei).";

          let transferText = "Kein Umstieg (Direktfahrt)";
          if (transfers > 0) {
            transferText = `${transfers}x Umsteigen (Wartezeit an Haltestellen: ca. ${waitMins} Min.)`;
          }

          return {
            label,
            dauer: r.durationText,
            dauerMinuten: r.durationMinutes,
            distanz: r.distanceText || "unbekannt",
            abfahrt: dep,
            ankunft: arr,
            verkehrsmittel: r.travelMode,
            linien: lines.length > 0 ? lines.join(", ") : undefined,
            umstiege: isTransit ? transferText : undefined,
            umstiegeAnzahl: isTransit ? transfers : 0,
            wartezeitMinuten: isTransit ? waitMins : 0,
            beschreibung: r.summary || (lines.length > 0 ? `Mit ${lines.join(" & ")}` : r.travelMode),
            kalenderKollision: conflictMsg,
            hatTerminKollision: hasConflict,
            googleMapsUrl: r.googleMapsUrl
          };
        };

        const opt1 = formatRouteItem(result, "Option 1 (Empfohlene Verbindung)");
        const opt2 = (result.alternatives && result.alternatives.length > 0)
          ? formatRouteItem(result.alternatives[0], "Option 2 (Alternative Verbindung)")
          : null;

        // Smarte Empfehlung und Vergleich
        let empfehlung = "";
        if (opt2) {
          if (opt1.hatTerminKollision && !opt2.hatTerminKollision) {
            empfehlung = `⚠️ Option 1 kollidiert mit einem Kalendertermin! Option 2 wird empfohlen, da sie perfekt in den Zeitplan passt (${opt2.abfahrt} - ${opt2.ankunft} Uhr).`;
          } else if (!opt1.hatTerminKollision && opt2.hatTerminKollision) {
            empfehlung = `Option 1 wird empfohlen, da Option 2 mit einem Termin im Kalender kollidiert.`;
          } else if (opt1.hatTerminKollision && opt2.hatTerminKollision) {
            empfehlung = `⚠️ Beide Routenoptionen überschneiden sich mit Terminen im Kalender. Bitte Zeitplan prüfen!`;
          } else if (opt1.wartezeitMinuten > opt2.wartezeitMinuten + 5) {
            empfehlung = `Option 2 hat deutlich weniger Wartezeit beim Umsteigen (${opt2.wartezeitMinuten} Min. vs. ${opt1.wartezeitMinuten} Min. bei Option 1).`;
          } else if (opt2.umstiegeAnzahl === 0 && opt1.umstiegeAnzahl > 0) {
            empfehlung = `Option 2 ist eine bequeme Direktverbindung ohne Umsteigen (${opt2.dauer}).`;
          } else {
            empfehlung = `Option 1 ist die schnellste Route (${opt1.dauer}), Option 2 bietet eine alternative Abfahrtszeit (${opt2.abfahrt} - ${opt2.ankunft} Uhr).`;
          }
        } else {
          empfehlung = opt1.hatTerminKollision
            ? `⚠️ Hinweis: ${opt1.kalenderKollision}`
            : `Die Route passt perfekt in den Zeitplan (keine Kalenderkollisionen).`;
        }

        let message = `📍 Route von "${result.origin}" nach "${result.destination}":\n\n`;
        message += `🔹 **Option 1**: Abfahrt ${opt1.abfahrt} Uhr → Ankunft ${opt1.ankunft} Uhr (Dauer: ${opt1.dauer}, ${opt1.distanz})`;
        if (opt1.linien) message += `\n   Linien: ${opt1.linien}`;
        if (opt1.umstiege) message += `\n   Umstiege: ${opt1.umstiege}`;
        message += `\n   Kalender: ${opt1.kalenderKollision}`;
        message += `\n   Maps: ${opt1.googleMapsUrl}\n`;

        if (opt2) {
          message += `\n🔹 **Option 2 (Alternative)**: Abfahrt ${opt2.abfahrt} Uhr → Ankunft ${opt2.ankunft} Uhr (Dauer: ${opt2.dauer}, ${opt2.distanz})`;
          if (opt2.linien) message += `\n   Linien: ${opt2.linien}`;
          if (opt2.umstiege) message += `\n   Umstiege: ${opt2.umstiege}`;
          message += `\n   Kalender: ${opt2.kalenderKollision}`;
          message += `\n   Maps: ${opt2.googleMapsUrl}\n`;
        }

        message += `\n💡 **Fazit / Empfehlung:** ${empfehlung}`;

        return {
          status: "success",
          start: result.origin,
          ziel: result.destination,
          reisemittel: result.travelMode,
          option1: opt1,
          option2: opt2,
          empfehlung,
          message
        };
      }
    },
    {
      definition: {
        name: "erstelle_wegzeit_termin",
        description: "Erstellt einen eigenständigen Wegzeit-Termin im Kalender basierend auf einer Google Maps Routenberechnung. Trägt die exakten Abfahrts- und Ankunftszeiten, Verkehrsmittel, Linien und Haltestellen ein. Nutze dieses Tool, wenn der Nutzer eine Fahrt, Anreise oder Heimweg im Kalender eintragen möchte.",
        parameters: {
          type: SchemaType.OBJECT,
          properties: {
            ziel: { type: SchemaType.STRING, description: "Zieladresse oder Name des Zielkontakts (z. B. 'Tom' oder 'Gemmingenstr. 15/1, Freiberg')" },
            start: { type: SchemaType.STRING, description: "Startadresse oder Startkontakt (optional, Standard ist der vorherige Terminort oder Zuhause)" },
            verkehrsmittel: { type: SchemaType.STRING, description: "Verkehrsmittel: 'transit' (Standard: Bahn/ÖPNV), 'driving' (Auto), 'bicycling' (Fahrrad), 'walking' (Zu Fuß)." },
            abfahrtszeit: { type: SchemaType.STRING, description: "Gewünschte Abfahrtszeit in deutscher Zeit (Europe/Berlin, z. B. '16:00' oder '2026-10-08T16:00:00'). Niemals in UTC umrechnen und kein 'Z' anhängen." },
            ankunftszeit: { type: SchemaType.STRING, description: "Gewünschte Ankunftszeit am Ziel in deutscher Zeit (Europe/Berlin, z. B. '16:44' oder '2026-10-08T16:44:00'). Niemals in UTC umrechnen und kein 'Z' anhängen." },
            titel: { type: SchemaType.STRING, description: "Optionaler Titel für die Wegzeit (z. B. 'Heimweg von Tom' oder 'Fahrt nach Freiberg')" }
          },
          required: ["ziel"]
        } as any
      },
      handler: async (args, { prisma }) => {
        let { start, ziel, verkehrsmittel, abfahrtszeit, ankunftszeit, titel } = args;
        const mode: TravelMode = (verkehrsmittel as TravelMode) || "transit";

        // Frühestmögliche Abfahrtszeit bestimmen (z. B. 16:00 Uhr vom vorherigen Termin oder vom Nutzer angegeben)
        let earliestDepDate: Date | null = null;
        if (abfahrtszeit) {
          earliestDepDate = parseFlexibleDate(abfahrtszeit);
        } else {
          const checkTime = ankunftszeit ? (parseFlexibleDate(ankunftszeit) || new Date()) : new Date();
          const prevEvNear = await prisma.event.findFirst({
            where: {
              isDeleted: false,
              isCancelled: false,
              end: { lte: checkTime }
            },
            orderBy: { end: 'desc' }
          });
          if (prevEvNear && prevEvNear.end) {
            const pEnd = new Date(prevEvNear.end);
            const isSameDay = pEnd.toDateString() === checkTime.toDateString();
            const diffMin = (checkTime.getTime() - pEnd.getTime()) / 60000;
            if (isSameDay && diffMin <= 240) {
              earliestDepDate = pEnd;
            }
          }
        }

        const targetArrDate = parseFlexibleDate(ankunftszeit);

        // Start und Ziel über zentralen Location-Resolver auflösen (Zuhause, Kontakte, Aliase, Orte)
        start = await RouteService.resolveLocation(start, prisma, true, earliestDepDate || targetArrDate || undefined);
        ziel = await RouteService.resolveLocation(ziel, prisma, false, targetArrDate || earliestDepDate || undefined);

        const routeResult = await RouteService.calculateRoute(start, ziel, mode, prisma, {
          departureTime: earliestDepDate || abfahrtszeit,
          arrivalTime: targetArrDate || ankunftszeit,
          prevEventEnd: earliestDepDate
        });

        let startDate = new Date();
        let endDate = new Date();

        const transitDep = routeResult.journeyStartDateTime || routeResult.transitDetails?.journeyStartDateTime || routeResult.transitDetails?.departureDateTime;
        const transitArr = routeResult.journeyEndDateTime || routeResult.transitDetails?.journeyEndDateTime || routeResult.transitDetails?.arrivalDateTime;

        // Bei ÖPNV / Bahn: Gesamtreise inklusive Fußweg zum Bahnhof und vom Bahnhof zum Ziel berücksichtigen!
        if (mode === "transit" && transitDep) {
          startDate = new Date(transitDep);
          endDate = transitArr ? new Date(transitArr) : new Date(startDate.getTime() + (routeResult.durationMinutes || 15) * 60000);
        } else if (earliestDepDate) {
          startDate = earliestDepDate;
          endDate = new Date(startDate.getTime() + (routeResult.durationMinutes || 15) * 60000);
        } else if (targetArrDate) {
          endDate = targetArrDate;
          startDate = new Date(endDate.getTime() - (routeResult.durationMinutes || 15) * 60000);
        } else {
          startDate = new Date();
          endDate = new Date(startDate.getTime() + (routeResult.durationMinutes || 15) * 60000);
        }

        const linesStr = routeResult.transitDetails?.lines?.length ? routeResult.transitDetails.lines.join(", ") : "";
        const finalTitle = titel || (linesStr ? `Fahrt mit ${linesStr} nach ${ziel}` : `Fahrt nach ${ziel}`);

        const transitDetailsToSave = {
          ...(routeResult.transitDetails || {}),
          earliestDepartureTime: (earliestDepDate && Math.abs(startDate.getTime() - earliestDepDate.getTime()) <= 240 * 60000) ? earliestDepDate.toISOString() : (routeResult.earliestDepartureTime || startDate.toISOString()),
          requestedDepartureTime: earliestDepDate ? earliestDepDate.toISOString() : undefined,
          targetArrivalTime: targetArrDate ? targetArrDate.toISOString() : undefined,
          bufferBeforeMinutes: (earliestDepDate && startDate.getTime() > earliestDepDate.getTime() && (startDate.getTime() - earliestDepDate.getTime()) <= 240 * 60000)
            ? Math.round((startDate.getTime() - earliestDepDate.getTime()) / 60000)
            : (routeResult.transitDetails?.bufferBeforeMinutes && routeResult.transitDetails.bufferBeforeMinutes <= 240 ? routeResult.transitDetails.bufferBeforeMinutes : null)
        };

        const createdEvent = await prisma.event.create({
          data: {
            title: finalTitle,
            description: routeResult.summary || (linesStr ? `ÖPNV-Verbindung mit ${linesStr}` : null),
            start: startDate,
            end: endDate,
            location: ziel,
            travelOriginLocation: start,
            travelMode: mode,
            travelDurationMinutes: routeResult.durationMinutes,
            travelDistanceText: routeResult.distanceText,
            travelTransitDetails: transitDetailsToSave as any
          }
        });

        const startOfDay = new Date(startDate);
        startOfDay.setHours(0, 0, 0, 0);
        const endOfDay = new Date(startDate);
        endOfDay.setHours(23, 59, 59, 999);
        const events = await prisma.event.findMany({
          where: {
            isDeleted: false,
            start: { lte: endOfDay },
            end: { gte: startOfDay }
          }
        });

        const depTimeStr = formatGermanTime(startDate);
        const arrTimeStr = formatGermanTime(endDate);

        return {
          status: "success",
          type: "calendar_widget",
          date: startDate.toISOString().split("T")[0],
          eventId: createdEvent.id,
          message: `Wegzeit eingetragen: "${finalTitle}" von "${start}" nach "${ziel}". Abfahrt: ${depTimeStr} Uhr, Ankunft: ${arrTimeStr} Uhr (ca. ${routeResult.durationText}${routeResult.distanceText ? `, ${routeResult.distanceText}` : ""}).`,
          event: {
            id: createdEvent.id,
            title: createdEvent.title,
            start: createdEvent.start,
            end: createdEvent.end,
            travelMode: createdEvent.travelMode,
            duration: routeResult.durationText
          },
          events: events.map((e: any) => ({
            ...e,
            time: e.start ? new Date(e.start).toISOString() : undefined,
            type: e.isBirthday ? "birthday" : "local"
          }))
        };
      }
    }
  ],
  getTopWidgets: async ({ prisma }) => {
    try {
      const locations = await prisma.location.findMany({
        where: { isDeleted: false },
        include: {
          persons: {
            where: { person: { isDeleted: false } },
            include: {
              person: {
                include: { aliases: true }
              }
            }
          }
        },
        orderBy: [{ isFavorite: "desc" }, { name: "asc" }]
      });

      const formattedLocations = await Promise.all(
        locations.map(async (loc: any) => {
          const persons = await getPersonsForLocation(prisma, loc);
          return {
            id: loc.id,
            name: loc.name,
            type: loc.type,
            address: loc.address,
            postalCode: loc.postalCode,
            city: loc.city,
            state: loc.state,
            country: loc.country,
            formattedAddress: loc.formattedAddress || buildFormattedAddress(loc),
            notes: loc.notes,
            isFavorite: !!loc.isFavorite,
            persons
          };
        })
      );

      return [
        {
          pluginName: "Locations",
          type: "custom",
          data: {
            widgetType: "locations_list",
            locations: formattedLocations
          }
        }
      ];
    } catch (e) {
      console.error("Fehler beim Laden des Locations-Widgets:", e);
      return [];
    }
  },
  entityConfig: {
    type: "location",
    prefix: "app://location/",
    color: "rgba(166, 227, 161, 0.15)",
    borderColor: "#a6e3a1",
    icon: "📍",
    displayName: "Ort"
  },
  resolveEntity: async (id, { prisma }) => {
    const loc = await prisma.location.findUnique({
      where: { id },
      include: {
        persons: {
          where: { person: { isDeleted: false } },
          include: {
            person: {
              include: { aliases: true }
            }
          }
        }
      }
    });
    if (!loc) return null;
    const persons = await getPersonsForLocation(prisma, loc);
    return {
      ...loc,
      formattedAddress: loc.formattedAddress || buildFormattedAddress(loc),
      persons
    };
  }
};
