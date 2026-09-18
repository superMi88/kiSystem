import { PrismaClient } from "@prisma/client";

export interface ActionItemDetectionResult {
  hasActionItem: boolean;
  taskTitle?: string;
  reason?: string;
  priority?: "niedrig" | "mittel" | "hoch";
  dueDate?: Date;
}

/**
 * Analysiert eingehende E-Mails auf Handlungsbedarf (Fristen, Rechnungen, Rückfragen, To-Dos)
 * und erzeugt bei Bedarf strukturierte Aufgaben.
 */
export function detectActionItemsInEmail(
  subject: string,
  bodyText: string,
  from: string
): ActionItemDetectionResult {
  const content = `${subject}\n${bodyText || ""}`;

  // Prüfen auf Rechnungen / Zahlungsaufforderungen
  const isInvoice = /rechnung|zahlungserinnerung|mahnung|zahlungsziel|fällig|überweisung|gebühr/i.test(subject) ||
    /(?:bitte\s+(?:überweisen|bezahlen|begleichen)|zahlbar\s+bis|fällig\s+am|fälligkeitsdatum)/i.test(content);

  // Prüfen auf Fristen und Deadlines
  const hasDeadline = /frist|deadline|bis\s+spätestens|bis\s+zum\s+\d{1,2}\.|rückmeldung\s+bis/i.test(content);

  // Prüfen auf Handlungsaufforderungen / Bitten
  const hasRequest = /(?:bitte\s+(?:prüfen|erledigen|bearbeiten|ausfüllen|bestätigen|senden|zusenden|weiterleiten|melden|anrufen|beantworten))|(?:kannst\s+du\s+bitte|könnten\s+sie\s+bitte|rückmeldung\s+erbeten)/i.test(content);

  // Ausschlusskriterien für automatische Benachrichtigungen (Newsletter, noreply, Abmeldelinks, etc.)
  const isAutomatedSpamOrNewsletter = /newsletter|abmelden|unsubscribe|no-?reply|keine\s+antwort|werbung|promotion/i.test(from) && !isInvoice;

  if (isAutomatedSpamOrNewsletter) {
    return { hasActionItem: false };
  }

  if (!isInvoice && !hasDeadline && !hasRequest) {
    return { hasActionItem: false };
  }

  // Ermittle Fälligkeitsdatum, falls im Text genannt
  let dueDate: Date | undefined;
  const deadlineDateMatch = content.match(/(?:bis\s+(?:zum)?|fällig\s+am|spätestens\s+am)\s*(\d{1,2})\.(\d{1,2})\.(\d{4}|\d{2})?/i);
  if (deadlineDateMatch) {
    const day = parseInt(deadlineDateMatch[1]);
    const month = parseInt(deadlineDateMatch[2]) - 1;
    const currentYear = new Date().getFullYear();
    const year = deadlineDateMatch[3] ? (deadlineDateMatch[3].length === 2 ? 2000 + parseInt(deadlineDateMatch[3]) : parseInt(deadlineDateMatch[3])) : currentYear;
    const parsedDate = new Date(year, month, day, 18, 0, 0);
    if (!isNaN(parsedDate.getTime()) && parsedDate.getTime() > Date.now()) {
      dueDate = parsedDate;
    }
  }

  // Falls kein Datum im Text gefunden, Standard-Frist: 2 Tage für normale Anfragen, 5 Tage für Rechnungen
  if (!dueDate) {
    const now = new Date();
    const daysToAdd = isInvoice ? 5 : 2;
    dueDate = new Date(now.getTime() + daysToAdd * 24 * 60 * 60 * 1000);
    dueDate.setHours(17, 0, 0, 0);
  }

  let priority: "niedrig" | "mittel" | "hoch" = "mittel";
  let reason = "Handlungsbedarf erkannt";
  let taskTitle = "";

  if (/mahnung|letzte\s+mahnung|dringend|sofort|eilig/i.test(content)) {
    priority = "hoch";
    reason = "Dringende Zahlungs- oder Fristaufforderung";
    taskTitle = `Dringend: ${subject}`;
  } else if (isInvoice) {
    priority = "hoch";
    reason = "Rechnung / Zahlung prüfen und begleichen";
    taskTitle = `Rechnung prüfen/bezahlen: ${cleanSubject(subject)}`;
  } else if (hasDeadline) {
    priority = "hoch";
    reason = "Fristgebundene Rückmeldung erforderlich";
    taskTitle = `Rückmeldung fällig: ${cleanSubject(subject)}`;
  } else {
    priority = "mittel";
    reason = "Aufgabe oder Rückfrage aus E-Mail";
    taskTitle = `E-Mail beantworten/bearbeiten: ${cleanSubject(subject)}`;
  }

  return {
    hasActionItem: true,
    taskTitle: taskTitle.slice(0, 150),
    reason,
    priority,
    dueDate
  };
}

function cleanSubject(sub: string): string {
  return sub.replace(/^(re|fwd|aw|wg):\s*/gi, "").trim();
}

/**
 * Erstellt automatisch eine Aufgabe für eine E-Mail, wenn Handlungsbedarf erkannt wurde
 * und noch keine gleichnamige Aufgabe existiert.
 */
export async function processEmailForActionItems(
  email: {
    id: number;
    subject: string;
    bodyText: string;
    from: string;
    fromName?: string;
    snippet?: string;
  },
  prisma: PrismaClient
): Promise<{ taskCreated: boolean; task?: any; notification?: string }> {
  try {
    const detection = detectActionItemsInEmail(email.subject, email.bodyText, email.from);
    if (!detection.hasActionItem || !detection.taskTitle) {
      return { taskCreated: false };
    }

    // Prüfen, ob bereits eine Aufgabe für diese E-Mail existiert
    const existingTask = await prisma.task.findFirst({
      where: {
        isDeleted: false,
        title: detection.taskTitle
      }
    });

    if (existingTask) {
      return { taskCreated: false };
    }

    const senderDisplay = email.fromName ? `${email.fromName} (${email.from})` : email.from;
    const taskDescription = `Automatisch erstellte Aufgabe aus E-Mail.\n` +
      `Absender: ${senderDisplay}\n` +
      `Betreff: ${email.subject}\n` +
      `Grund: ${detection.reason}\n\n` +
      `Auszug:\n${(email.snippet || email.bodyText || "").slice(0, 300)}...`;

    const newTask = await prisma.task.create({
      data: {
        title: detection.taskTitle,
        notes: taskDescription,
        due: detection.dueDate || null,
        listTitle: "Standard",
        isPlanned: false,
        completed: false
      }
    });

    const notificationMsg = `📋 Neue Aufgabe automatisch erstellt: "${newTask.title}" (Fällig: ${newTask.due ? newTask.due.toLocaleDateString('de-DE') : 'Bald'})`;
    console.log(`[ActionItemService] ${notificationMsg}`);

    return {
      taskCreated: true,
      task: newTask,
      notification: notificationMsg
    };
  } catch (err) {
    console.error("[ActionItemService] Fehler bei automatischer Aufgabenerstellung:", err);
    return { taskCreated: false };
  }
}
