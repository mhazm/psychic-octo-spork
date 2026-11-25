import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Db } from "mongodb";
import { z } from "zod";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPORT_ROOT = path.resolve(__dirname, "..", "..", "report");

const MONTH_NAME_TO_NUM: Record<string, number> = {
  januari: 1, jan: 1, january: 1,
  februari: 2, feb: 2, february: 2,
  maret: 3, mar: 3, march: 3,
  april: 4, apr: 4,
  mei: 5, may: 5,
  juni: 6, jun: 6, june: 6,
  juli: 7, jul: 7, july: 7,
  agustus: 8, agu: 8, aug: 8, august: 8,
  september: 9, sep: 9, sept: 9,
  oktober: 10, okt: 10, oct: 10, october: 10,
  november: 11, nov: 11,
  desember: 12, des: 12, dec: 12, december: 12,
};

const NUM_TO_MONTH_NAME = [
  "",
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember",
];

function normalizeMonthKey(input: string, fallbackYear?: number): string | null {
  const cleaned = String(input || "").trim().toLowerCase();
  if (!cleaned) return null;

  const isoMatch = cleaned.match(/^(\d{4})[-/](\d{1,2})$/);
  if (isoMatch) {
    const m = Number(isoMatch[2]);
    if (m >= 1 && m <= 12) return `${isoMatch[1]}-${String(m).padStart(2, "0")}`;
  }

  const revMatch = cleaned.match(/^(\d{1,2})[-/](\d{4})$/);
  if (revMatch) {
    const m = Number(revMatch[1]);
    if (m >= 1 && m <= 12) return `${revMatch[2]}-${String(m).padStart(2, "0")}`;
  }

  const nameYearMatch = cleaned.match(/^([a-z]+)[\s_-]*(\d{4})$/);
  if (nameYearMatch && MONTH_NAME_TO_NUM[nameYearMatch[1]]) {
    const m = MONTH_NAME_TO_NUM[nameYearMatch[1]];
    return `${nameYearMatch[2]}-${String(m).padStart(2, "0")}`;
  }

  const yearNameMatch = cleaned.match(/^(\d{4})[\s_-]*([a-z]+)$/);
  if (yearNameMatch && MONTH_NAME_TO_NUM[yearNameMatch[2]]) {
    const m = MONTH_NAME_TO_NUM[yearNameMatch[2]];
    return `${yearNameMatch[1]}-${String(m).padStart(2, "0")}`;
  }

  const numOnly = /^\d{1,2}$/.test(cleaned)
    ? Number(cleaned)
    : MONTH_NAME_TO_NUM[cleaned] || 0;

  if (numOnly >= 1 && numOnly <= 12) {
    const mm = String(numOnly).padStart(2, "0");
    if (fallbackYear) return `${fallbackYear}-${mm}`;
    if (fs.existsSync(REPORT_ROOT)) {
      const candidates = fs
        .readdirSync(REPORT_ROOT, { withFileTypes: true })
        .filter((e) => e.isDirectory() && new RegExp(`^\\d{4}-${mm}$`).test(e.name))
        .map((e) => e.name)
        .sort()
        .reverse();
      if (candidates.length > 0) return candidates[0];
    }
    return `${new Date().getFullYear()}-${mm}`;
  }

  return null;
}

function formatMonthLabel(monthKey: string): string {
  const m = monthKey.match(/^(\d{4})-(\d{2})$/);
  if (!m) return monthKey;
  return `${NUM_TO_MONTH_NAME[Number(m[2])] || m[2]} ${m[1]}`;
}

function getWibMonthDateRange(monthKey: string): { startOfMonth: Date; endOfMonth: Date } {
  const [yearStr, mStr] = monthKey.split("-");
  const year = parseInt(yearStr, 10);
  const monthIndex = parseInt(mStr, 10) - 1;
  const startOfMonth = new Date(Date.UTC(year, monthIndex, 1, 0, 0, 0, 0));
  startOfMonth.setUTCHours(startOfMonth.getUTCHours() - 7);
  const endOfMonth = new Date(Date.UTC(year, monthIndex + 1, 1, 0, 0, 0, 0));
  endOfMonth.setUTCHours(endOfMonth.getUTCHours() - 7);
  return { startOfMonth, endOfMonth };
}

function parseCsv(content: string): Record<string, string>[] {
  const text = content.replace(/^\uFEFF/, "");
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ",") {
        row.push(field);
        field = "";
      } else if (ch === "\r") {
        // skip CR
      } else if (ch === "\n") {
        row.push(field);
        if (row.some((cell) => cell.length > 0)) rows.push(row);
        row = [];
        field = "";
      } else {
        field += ch;
      }
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    if (row.some((cell) => cell.length > 0)) rows.push(row);
  }

  if (rows.length < 2) return [];
  const headers = rows[0].map((h) => h.trim());
  return rows.slice(1).map((r) => {
    const obj: Record<string, string> = {};
    for (let j = 0; j < headers.length; j++) {
      obj[headers[j]] = r[j] ?? "";
    }
    return obj;
  });
}

function toNum(val: any): number {
  if (val === null || val === undefined || val === "") return 0;
  const n = Number(String(val).replace(/,/g, ""));
  return Number.isFinite(n) ? n : 0;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function readJsonArray(filePath: string): any[] {
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf-8"));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function readJsonObject(filePath: string): any | null {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf-8"));
  } catch {
    return null;
  }
}

interface DivisionMetrics {
  available: boolean;
  totalJobs: number;
  completedJobs: number;
  canceledJobs: number;
  completionRatePct: number;
  totalDistanceKm: number;
  avgDistanceKm: number;
  totalDurationHours: number;
  totalRevenueNC: number;
  totalXp: number;
  totalCostNC: number;
  totalDiscountNC: number;
  hardcoreJobs: number;
  totalPenaltyPointsSystem: number;
  avgDamagePct: { vehicle: number; trailer: number; cargo: number };
  byGame: Record<string, { completed: number; canceled: number; revenueNC: number }>;
  byGameMode: Record<string, number>;
  byVehicleStatus: Record<string, number>;
  topCargosByNC?: Array<{ cargoName: string; revenueNC: number }>;
  totalPassengers?: number;
  avgPassengersPerTrip?: number;
  totalStops?: number;
  topBusModels?: Array<{ model: string; trips: number }>;
  topRoutes?: Array<{ route: string; trips: number }>;
}

function emptyDivision(isCoach: boolean): DivisionMetrics {
  const base: DivisionMetrics = {
    available: false,
    totalJobs: 0,
    completedJobs: 0,
    canceledJobs: 0,
    completionRatePct: 0,
    totalDistanceKm: 0,
    avgDistanceKm: 0,
    totalDurationHours: 0,
    totalRevenueNC: 0,
    totalXp: 0,
    totalCostNC: 0,
    totalDiscountNC: 0,
    hardcoreJobs: 0,
    totalPenaltyPointsSystem: 0,
    avgDamagePct: { vehicle: 0, trailer: 0, cargo: 0 },
    byGame: {},
    byGameMode: {},
    byVehicleStatus: {},
  };
  if (isCoach) {
    base.totalPassengers = 0;
    base.avgPassengersPerTrip = 0;
    base.totalStops = 0;
    base.topBusModels = [];
    base.topRoutes = [];
  } else {
    base.topCargosByNC = [];
  }
  return base;
}

function normalizeJobDocToRow(doc: any): Record<string, string> {
  const stopsCount = Array.isArray(doc.stops) ? doc.stops.length : toNum(doc.stopsCount);
  const marketType = String(doc.marketType || "");
  const jobCategory = doc.jobCategory || (marketType.toLowerCase().startsWith("bus") ? "coach" : "truck");
  return {
    jobStatus: String(doc.jobStatus || ""),
    jobCategory: String(jobCategory),
    game: String(doc.game || "Unknown"),
    gameMode: String(doc.gameMode || "Unknown"),
    isHardcore: String(Boolean(doc.isHardcore)),
    marketType,
    cargoName: String(doc.cargoName || ""),
    totalPassengers: String(toNum(doc.totalPassengers)),
    stopsCount: String(stopsCount),
    vehicleStatus: String(doc.vehicleStatus || "Unknown"),
    sourceCity: String(doc.sourceCity || ""),
    destinationCity: String(doc.destinationCity || ""),
    distanceKm: String(toNum(doc.distanceKm)),
    durationSeconds: String(toNum(doc.durationSeconds)),
    "nc.total": String(toNum(doc.nc?.total)),
    "xp.total": String(toNum(doc.xp?.total)),
    "discount.total": String(toNum(doc.discount?.total)),
    "damage.vehicle": String(toNum(doc.damage?.vehicle)),
    "damage.trailer": String(toNum(doc.damage?.trailer)),
    "damage.cargo": String(toNum(doc.damage?.cargo)),
    "penalty.total": String(toNum(doc.penalty?.total)),
    "ncCost.total": String(toNum(doc.ncCost?.total)),
    "vehicle.brand": String(doc.vehicle?.brand || ""),
    "vehicle.model": String(doc.vehicle?.model || ""),
  };
}

function aggregateDivisionRows(rows: Record<string, string>[], isCoach: boolean): DivisionMetrics {
  const m = emptyDivision(isCoach);
  if (rows.length === 0) return m;

  m.available = true;
  m.totalJobs = rows.length;

  let dmgVeh = 0, dmgTrl = 0, dmgCrg = 0, dmgCount = 0;
  const cargoRevenueMap: Record<string, number> = {};
  const busModelMap: Record<string, number> = {};
  const routeMap: Record<string, number> = {};

  for (const r of rows) {
    const status = (r.jobStatus || "").toUpperCase();
    const isCompleted = status === "COMPLETED";
    const isCanceled = status === "CANCELED" || status === "CANCELLED";
    if (isCompleted) m.completedJobs++;
    if (isCanceled) m.canceledJobs++;

    const game = r.game || "Unknown";
    if (!m.byGame[game]) m.byGame[game] = { completed: 0, canceled: 0, revenueNC: 0 };
    if (isCompleted) m.byGame[game].completed++;
    if (isCanceled) m.byGame[game].canceled++;

    const mode = r.gameMode || "Unknown";
    m.byGameMode[mode] = (m.byGameMode[mode] || 0) + 1;

    const vStatus = r.vehicleStatus || "Unknown";
    m.byVehicleStatus[vStatus] = (m.byVehicleStatus[vStatus] || 0) + 1;

    const ncTotal = toNum(r["nc.total"]);
    if (isCompleted) {
      m.byGame[game].revenueNC = round2(m.byGame[game].revenueNC + ncTotal);
      m.totalRevenueNC += ncTotal;
      m.totalDistanceKm += toNum(r.distanceKm);
      m.totalDurationHours += toNum(r.durationSeconds) / 3600;
      m.totalXp += toNum(r["xp.total"]);
      m.totalDiscountNC += toNum(r["discount.total"]);

      if (String(r.isHardcore).toLowerCase() === "true") m.hardcoreJobs++;

      dmgVeh += toNum(r["damage.vehicle"]);
      dmgTrl += toNum(r["damage.trailer"]);
      dmgCrg += toNum(r["damage.cargo"]);
      dmgCount++;

      if (isCoach) {
        m.totalPassengers = (m.totalPassengers || 0) + toNum(r.totalPassengers);
        m.totalStops = (m.totalStops || 0) + toNum(r.stopsCount);
        const busName = `${r["vehicle.brand"] || ""} ${r["vehicle.model"] || ""}`.trim();
        if (busName) busModelMap[busName] = (busModelMap[busName] || 0) + 1;
        if (r.sourceCity || r.destinationCity) {
          const route = `${r.sourceCity || "?"} -> ${r.destinationCity || "?"}`;
          routeMap[route] = (routeMap[route] || 0) + 1;
        }
      } else {
        const cargoName = r.cargoName || "Unknown";
        cargoRevenueMap[cargoName] = (cargoRevenueMap[cargoName] || 0) + ncTotal;
      }
    }

    m.totalCostNC += toNum(r["ncCost.total"]);
    m.totalPenaltyPointsSystem += toNum(r["penalty.total"]);
  }

  m.completionRatePct = m.totalJobs > 0 ? round2((m.completedJobs / m.totalJobs) * 100) : 0;
  m.totalDistanceKm = round2(m.totalDistanceKm);
  m.avgDistanceKm = m.completedJobs > 0 ? round2(m.totalDistanceKm / m.completedJobs) : 0;
  m.totalDurationHours = round2(m.totalDurationHours);
  m.totalRevenueNC = round2(m.totalRevenueNC);
  m.totalXp = Math.round(m.totalXp);
  m.totalCostNC = round2(m.totalCostNC);
  m.totalDiscountNC = round2(m.totalDiscountNC);
  m.totalPenaltyPointsSystem = round2(m.totalPenaltyPointsSystem);

  if (dmgCount > 0) {
    m.avgDamagePct = {
      vehicle: round2(dmgVeh / dmgCount),
      trailer: round2(dmgTrl / dmgCount),
      cargo: round2(dmgCrg / dmgCount),
    };
  }

  if (isCoach) {
    m.avgPassengersPerTrip =
      m.completedJobs > 0 ? round2((m.totalPassengers || 0) / m.completedJobs) : 0;
    m.topBusModels = Object.entries(busModelMap)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([model, trips]) => ({ model, trips }));
    m.topRoutes = Object.entries(routeMap)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([route, trips]) => ({ route, trips }));
  } else {
    m.topCargosByNC = Object.entries(cargoRevenueMap)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([cargoName, revenueNC]) => ({ cargoName, revenueNC: round2(revenueNC) }));
  }

  return m;
}

function isCoachRow(r: Record<string, string>): boolean {
  const cat = (r.jobCategory || "").trim().toLowerCase();
  if (cat === "coach") return true;
  if (cat === "truck") return false;
  const mt = (r.marketType || "").trim().toLowerCase();
  return mt.startsWith("bus");
}

interface Ecosystem360Bundle {
  ecosystem: {
    available: boolean;
    convoysCount: number;
    convoyParticipantsTotal: number;
    contractsCount: number;
    specialContractJobs: number;
    specialContractNC: number;
    ncBoostEventsCount: number;
    ncBoostParticipantsTotal: number;
    couponsCount: number;
    couponClaimsCount: number;
    couponNcClaimed: number;
    giveawaysCount: number;
    giveawayTitles: string[];
    giveawayWinnersCount: number;
    giveawayTicketsCount: number;
    giveawayNcBurned: number;
    vouchersIssuedCount: number;
    vouchersUsedCount: number;
    vouchersByCategory: Record<string, number>;
    penaltyPointsAdded: number;
    penaltyPointsRemoved: number;
  };
  minigames: {
    available: boolean;
    lottoPeriodsCount: number;
    lottoTicketsCount: number;
    lottoPrizeWonNC: number;
    scratchTicketsCount: number;
    scratchSpentNC: number;
    scratchPrizeWonNC: number;
    scratchNetBurnNC: number;
    racingTicketsCount: number;
    racingBetNC: number;
    racingPrizeWonNC: number;
    racingNetBurnNC: number;
    quizAttemptsCount: number;
    quizPassedCount: number;
    quizPassRatePct: number;
  };
  commerce: {
    available: boolean;
    transactionsCount: number;
    totalSpentNC: number;
    totalSpentIDR: number;
    totalVoucherDiscountNC: number;
    transactionsByCategory: Record<string, number>;
    fuelTransactionsCount: number;
    fuelTotalLiters: number;
    fuelSystemLiters: number;
    fuelP2pLiters: number;
    fuelTotalVolumeNC: number;
    fuelTotalFeeNC: number;
  };
  social: {
    available: boolean;
    galleryPostsCount: number;
    galleryTotalLikes: number;
  };
}

interface EcosystemRawArrays {
  hasCoreFiles: boolean;
  hasMinigameFiles: boolean;
  hasCommerceFiles: boolean;
  hasSocialFiles: boolean;
  convoys: any[];
  contracts: any[];
  ncevents: any[];
  coupons: any[];
  giveaways: any[];
  giveawayTickets: any[];
  vouchers: any[];
  pointHistories: any[];
  lottoPeriods: any[];
  lottoTickets: any[];
  scratchTickets: any[];
  racingTickets: any[];
  quizAttempts: any[];
  transactions: any[];
  fuelTransactions: any[];
  galleryPosts: any[];
}

function aggregateEcosystem360(raw: EcosystemRawArrays): Ecosystem360Bundle {
  let convoyParticipantsTotal = 0;
  for (const c of raw.convoys) {
    if (Array.isArray(c.partisipan)) convoyParticipantsTotal += c.partisipan.length;
  }

  let specialContractJobs = 0;
  let specialContractNC = 0;
  for (const c of raw.contracts) {
    specialContractJobs += toNum(c.completedContracts);
    specialContractNC += toNum(c.totalNCEarned);
  }

  let ncBoostParticipantsTotal = 0;
  for (const e of raw.ncevents) {
    if (Array.isArray(e.participants)) ncBoostParticipantsTotal += e.participants.length;
  }

  let couponClaimsCount = 0;
  let couponNcClaimed = 0;
  for (const c of raw.coupons) {
    if (Array.isArray(c.driverClaims)) couponClaimsCount += c.driverClaims.length;
    couponNcClaimed += toNum(c.totalNcClaimed);
  }

  let giveawayWinnersCount = 0;
  let giveawayStatsNcBurned = 0;
  const giveawayTitles: string[] = [];
  for (const g of raw.giveaways) {
    if (g.title) giveawayTitles.push(String(g.title));
    if (Array.isArray(g.winners)) giveawayWinnersCount += g.winners.length;
    giveawayStatsNcBurned += toNum(g.stats?.totalNcBurned);
  }
  let giveawayTicketsCostNC = 0;
  for (const t of raw.giveawayTickets) {
    giveawayTicketsCostNC += toNum(t.costNC);
  }

  let vouchersUsedCount = 0;
  const vouchersByCategory: Record<string, number> = {};
  for (const v of raw.vouchers) {
    if (String(v.status || "").toUpperCase() === "USED") vouchersUsedCount++;
    const cat = String(v.category || "OTHER");
    vouchersByCategory[cat] = (vouchersByCategory[cat] || 0) + 1;
  }

  let penaltyPointsAdded = 0;
  let penaltyPointsRemoved = 0;
  for (const p of raw.pointHistories) {
    if (p.type === "add") penaltyPointsAdded += toNum(p.points);
    if (p.type === "remove") penaltyPointsRemoved += toNum(p.points);
  }

  let lottoPrizeWonNC = 0;
  for (const t of raw.lottoTickets) lottoPrizeWonNC += toNum(t.prizeWon);

  let scratchSpentNC = 0;
  let scratchPrizeWonNC = 0;
  for (const s of raw.scratchTickets) {
    scratchSpentNC += toNum(s.price);
    scratchPrizeWonNC += toNum(s.prizeWon);
  }

  let racingBetNC = 0;
  let racingPrizeWonNC = 0;
  for (const r of raw.racingTickets) {
    racingBetNC += toNum(r.betAmount);
    racingPrizeWonNC += toNum(r.prizeWon);
  }

  const quizPassedCount = raw.quizAttempts.filter((q) => q.passed === true).length;
  const quizPassRatePct =
    raw.quizAttempts.length > 0 ? round2((quizPassedCount / raw.quizAttempts.length) * 100) : 0;

  let transactionsCount = 0;
  let totalSpentNC = 0;
  let totalSpentIDR = 0;
  let totalVoucherDiscountNC = 0;
  const transactionsByCategory: Record<string, number> = {};
  for (const tx of raw.transactions) {
    const st = String(tx.status || "success").toLowerCase();
    if (!["success", "completed", "paid"].includes(st)) continue;
    transactionsCount++;
    const cur = String(tx.currency || "NC").toUpperCase();
    if (cur === "IDR") totalSpentIDR += toNum(tx.amount);
    else totalSpentNC += toNum(tx.amount);
    totalVoucherDiscountNC += toNum(tx.metadata?.voucherDiscount);
    const cat = String(tx.category || "other");
    transactionsByCategory[cat] = (transactionsByCategory[cat] || 0) + 1;
  }

  let fuelTotalLiters = 0;
  let fuelSystemLiters = 0;
  let fuelP2pLiters = 0;
  let fuelTotalVolumeNC = 0;
  let fuelTotalFeeNC = 0;
  for (const f of raw.fuelTransactions) {
    const liters = Math.floor(toNum(f.amount));
    fuelTotalLiters += liters;
    if (f.type === "p2p") fuelP2pLiters += liters;
    else fuelSystemLiters += liters;
    fuelTotalVolumeNC += toNum(f.totalPrice);
    fuelTotalFeeNC += toNum(f.fee);
  }

  let galleryTotalLikes = 0;
  for (const p of raw.galleryPosts) {
    if (Array.isArray(p.likes)) galleryTotalLikes += p.likes.length;
  }

  return {
    ecosystem: {
      available: raw.hasCoreFiles,
      convoysCount: raw.convoys.length,
      convoyParticipantsTotal,
      contractsCount: raw.contracts.length,
      specialContractJobs,
      specialContractNC: round2(specialContractNC),
      ncBoostEventsCount: raw.ncevents.length,
      ncBoostParticipantsTotal,
      couponsCount: raw.coupons.length,
      couponClaimsCount,
      couponNcClaimed: round2(couponNcClaimed),
      giveawaysCount: raw.giveaways.length,
      giveawayTitles,
      giveawayWinnersCount,
      giveawayTicketsCount: raw.giveawayTickets.length,
      giveawayNcBurned: round2(Math.max(giveawayStatsNcBurned, giveawayTicketsCostNC)),
      vouchersIssuedCount: raw.vouchers.length,
      vouchersUsedCount,
      vouchersByCategory,
      penaltyPointsAdded: round2(penaltyPointsAdded),
      penaltyPointsRemoved: round2(penaltyPointsRemoved),
    },
    minigames: {
      available: raw.hasMinigameFiles,
      lottoPeriodsCount: raw.lottoPeriods.length,
      lottoTicketsCount: raw.lottoTickets.length,
      lottoPrizeWonNC: round2(lottoPrizeWonNC),
      scratchTicketsCount: raw.scratchTickets.length,
      scratchSpentNC: round2(scratchSpentNC),
      scratchPrizeWonNC: round2(scratchPrizeWonNC),
      scratchNetBurnNC: round2(scratchSpentNC - scratchPrizeWonNC),
      racingTicketsCount: raw.racingTickets.length,
      racingBetNC: round2(racingBetNC),
      racingPrizeWonNC: round2(racingPrizeWonNC),
      racingNetBurnNC: round2(racingBetNC - racingPrizeWonNC),
      quizAttemptsCount: raw.quizAttempts.length,
      quizPassedCount,
      quizPassRatePct,
    },
    commerce: {
      available: raw.hasCommerceFiles,
      transactionsCount,
      totalSpentNC: round2(totalSpentNC),
      totalSpentIDR: round2(totalSpentIDR),
      totalVoucherDiscountNC: round2(totalVoucherDiscountNC),
      transactionsByCategory,
      fuelTransactionsCount: raw.fuelTransactions.length,
      fuelTotalLiters,
      fuelSystemLiters,
      fuelP2pLiters,
      fuelTotalVolumeNC: round2(fuelTotalVolumeNC),
      fuelTotalFeeNC: round2(fuelTotalFeeNC),
    },
    social: {
      available: raw.hasSocialFiles,
      galleryPostsCount: raw.galleryPosts.length,
      galleryTotalLikes,
    },
  };
}

interface MonthReportMetrics {
  monthKey: string;
  label: string;
  source: string;
  folderExists: boolean;
  files: string[];
  logistics: DivisionMetrics;
  coaches: DivisionMetrics;
  ecosystem: Ecosystem360Bundle["ecosystem"];
  minigames: Ecosystem360Bundle["minigames"];
  commerce: Ecosystem360Bundle["commerce"];
  social: Ecosystem360Bundle["social"];
  driverAudit: {
    available: boolean;
    totalDrivers: number;
    passedCount: number;
    complianceRatePct: number;
    failedActiveCount: number;
    failedOnLeaveCount: number;
    missingUserCount: number;
    totalFleetKm: number;
    totalFleetJobs: number;
    avgKmPerDriver: number;
  };
  staffKpi?: {
    available: boolean;
    teamTotals?: Record<string, any>;
    staffCount?: number;
  };
  markdownReports?: Record<string, string>;
}

function emptyDriverAudit(): MonthReportMetrics["driverAudit"] {
  return {
    available: false,
    totalDrivers: 0,
    passedCount: 0,
    complianceRatePct: 0,
    failedActiveCount: 0,
    failedOnLeaveCount: 0,
    missingUserCount: 0,
    totalFleetKm: 0,
    totalFleetJobs: 0,
    avgKmPerDriver: 0,
  };
}

function loadDriverAuditAndExtras(dir: string, files: string[], includeMarkdown: boolean) {
  const findFile = (prefix: string, ext: string) =>
    files.find((f) => f.toLowerCase().startsWith(prefix) && f.toLowerCase().endsWith(ext));

  const auditCsv = findFile("audit_driver_", ".csv");
  const driverAudit = emptyDriverAudit();

  if (auditCsv) {
    const rows = parseCsv(fs.readFileSync(path.join(dir, auditCsv), "utf-8"));
    driverAudit.available = true;
    driverAudit.totalDrivers = rows.length;

    for (const r of rows) {
      const statusRaw = (r["Status Target"] || r["Status"] || r.status || "").toUpperCase();
      const onLeaveRaw = (r["Sedang Cuti"] || r.isOnLeave || "").toUpperCase();
      const hasUserRaw = (r["Ada di Users DB"] || r.hasUserDoc || "YA").toUpperCase();

      const isPassed =
        statusRaw.includes("PASSED") ||
        (statusRaw.includes("MEMENUHI") && !statusRaw.includes("TIDAK")) ||
        statusRaw === "LOLOS";
      const isOnLeave =
        onLeaveRaw === "YA" ||
        onLeaveRaw === "TRUE" ||
        onLeaveRaw === "YES" ||
        statusRaw.includes("CUTI");
      const missingUser =
        hasUserRaw === "TIDAK" ||
        hasUserRaw === "FALSE" ||
        hasUserRaw === "NO" ||
        statusRaw.includes("TIDAK ADA DATA USERS");

      if (isPassed) driverAudit.passedCount++;
      else if (isOnLeave) driverAudit.failedOnLeaveCount++;
      else if (!missingUser) driverAudit.failedActiveCount++;

      if (missingUser) driverAudit.missingUserCount++;

      driverAudit.totalFleetKm += toNum(r["Total KM"] ?? r.totalKm);
      driverAudit.totalFleetJobs += toNum(r["Jumlah Jobs"] ?? r.jobCount);
    }

    driverAudit.totalFleetKm = round2(driverAudit.totalFleetKm);
    driverAudit.complianceRatePct =
      driverAudit.totalDrivers > 0
        ? round2((driverAudit.passedCount / driverAudit.totalDrivers) * 100)
        : 0;
    driverAudit.avgKmPerDriver =
      driverAudit.totalDrivers > 0
        ? round2(driverAudit.totalFleetKm / driverAudit.totalDrivers)
        : 0;
  }

  const staffJson = findFile("staff_kpi_", ".json");
  let staffKpi: MonthReportMetrics["staffKpi"] = { available: false };
  if (staffJson) {
    const parsed = readJsonObject(path.join(dir, staffJson));
    if (parsed?.teamTotals) {
      staffKpi = {
        available: true,
        teamTotals: parsed.teamTotals,
        staffCount: Array.isArray(parsed.staff) ? parsed.staff.length : 0,
      };
    }
  }

  let markdownReports: Record<string, string> | undefined;
  if (includeMarkdown) {
    const mdFiles = files.filter((f) => f.toLowerCase().endsWith(".md"));
    if (mdFiles.length > 0) {
      markdownReports = {};
      for (const f of mdFiles) {
        const text = fs.readFileSync(path.join(dir, f), "utf-8");
        markdownReports[f] =
          text.length > 12000 ? text.slice(0, 12000) + "\n\n...[truncated]" : text;
      }
    }
  }

  return { driverAudit, staffKpi, markdownReports };
}

function loadMonthMetricsFromFiles(monthKey: string, includeMarkdown = false): MonthReportMetrics {
  const dir = path.resolve(REPORT_ROOT, monthKey);
  if (!dir.startsWith(REPORT_ROOT) || !fs.existsSync(dir)) {
    const emptyEco = aggregateEcosystem360({
      hasCoreFiles: false, hasMinigameFiles: false, hasCommerceFiles: false, hasSocialFiles: false,
      convoys: [], contracts: [], ncevents: [], coupons: [], giveaways: [], giveawayTickets: [],
      vouchers: [], pointHistories: [], lottoPeriods: [], lottoTickets: [], scratchTickets: [],
      racingTickets: [], quizAttempts: [], transactions: [], fuelTransactions: [], galleryPosts: [],
    });
    return {
      monthKey,
      label: formatMonthLabel(monthKey),
      source: "file:not_found",
      folderExists: false,
      files: [],
      logistics: emptyDivision(false),
      coaches: emptyDivision(true),
      ...emptyEco,
      driverAudit: emptyDriverAudit(),
      staffKpi: { available: false },
    };
  }

  const files = fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isFile())
    .map((e) => e.name)
    .sort();

  const findFile = (prefix: string, ext: string) =>
    files.find((f) => f.toLowerCase().startsWith(prefix) && f.toLowerCase().endsWith(ext));

  const jobCsv = findFile("data_jobhistories_", ".csv");
  let logistics = emptyDivision(false);
  let coaches = emptyDivision(true);

  if (jobCsv) {
    const allRows = parseCsv(fs.readFileSync(path.join(dir, jobCsv), "utf-8"));
    logistics = aggregateDivisionRows(allRows.filter((r) => !isCoachRow(r)), false);
    coaches = aggregateDivisionRows(allRows.filter((r) => isCoachRow(r)), true);
  }

  const convoyFile = findFile("data_convoylobby_", ".json");
  const contractFile = findFile("data_contracts_", ".json") || findFile("data_contracthistories_", ".json");
  const ncEventFile = findFile("data_ncevents_", ".json");
  const couponFile = findFile("data_coupons_", ".json");
  const giveawayFile = findFile("data_giveaways_", ".json");
  const giveawayTicketFile = findFile("data_giveawaytickets_", ".json");
  const voucherFile = findFile("data_uservouchers_", ".json");
  const pointFile = findFile("data_pointhistories_", ".json");

  const lottoPeriodFile = findFile("data_lottoperiods_", ".json");
  const lottoTicketFile = findFile("data_lottotickets_", ".json");
  const scratchFile = findFile("data_scratchtickets_", ".json");
  const racingFile = findFile("data_racingtickets_", ".json");
  const quizFile = findFile("data_quizattempts_", ".json");

  const txFile = findFile("data_transactions_", ".json");
  const fuelFile = findFile("data_fueltransactions_", ".json");
  const galleryFile = findFile("data_gallery_posts_", ".json");

  const readIf = (f?: string) => (f ? readJsonArray(path.join(dir, f)) : []);

  const ecoBundle = aggregateEcosystem360({
    hasCoreFiles: Boolean(
      convoyFile || contractFile || ncEventFile || couponFile || giveawayFile || voucherFile || pointFile
    ),
    hasMinigameFiles: Boolean(lottoPeriodFile || lottoTicketFile || scratchFile || racingFile || quizFile),
    hasCommerceFiles: Boolean(txFile || fuelFile),
    hasSocialFiles: Boolean(galleryFile),
    convoys: readIf(convoyFile),
    contracts: readIf(contractFile),
    ncevents: readIf(ncEventFile),
    coupons: readIf(couponFile),
    giveaways: readIf(giveawayFile),
    giveawayTickets: readIf(giveawayTicketFile),
    vouchers: readIf(voucherFile),
    pointHistories: readIf(pointFile),
    lottoPeriods: readIf(lottoPeriodFile),
    lottoTickets: readIf(lottoTicketFile),
    scratchTickets: readIf(scratchFile),
    racingTickets: readIf(racingFile),
    quizAttempts: readIf(quizFile),
    transactions: readIf(txFile),
    fuelTransactions: readIf(fuelFile),
    galleryPosts: readIf(galleryFile),
  });

  const { driverAudit, staffKpi, markdownReports } = loadDriverAuditAndExtras(dir, files, includeMarkdown);

  return {
    monthKey,
    label: formatMonthLabel(monthKey),
    source: `file:report/${monthKey}`,
    folderExists: true,
    files,
    logistics,
    coaches,
    ...ecoBundle,
    driverAudit,
    staffKpi,
    ...(markdownReports ? { markdownReports } : {}),
  };
}

async function computeLiveMonthMetrics(
  db: Db,
  monthKey: string,
  includeMarkdown = false
): Promise<MonthReportMetrics> {
  const { startOfMonth, endOfMonth } = getWibMonthDateRange(monthKey);
  const range = { $gte: startOfMonth, $lt: endOfMonth };

  const [
    jobs,
    convoys,
    contracts,
    ncevents,
    coupons,
    giveaways,
    giveawayTickets,
    vouchers,
    pointHistories,
    lottoPeriods,
    lottoTickets,
    scratchTickets,
    racingTickets,
    quizAttempts,
    transactions,
    fuelTransactions,
    galleryPosts,
  ] = await Promise.all([
    db.collection("jobhistories").find({ createdAt: range }).toArray(),
    db.collection("convoylobby").find({ startDate: range }).toArray(),
    db.collection("contracts").find({ startDate: range }).toArray(),
    db.collection("ncevents").find({ createdAt: range }).toArray(),
    db.collection("coupons").find({ startDate: range }).toArray(),
    db.collection("giveaways").find({ startDate: range }).toArray(),
    db.collection("giveawaytickets").find({ createdAt: range }).toArray(),
    db.collection("uservouchers").find({ createdAt: range }).toArray(),
    db.collection("pointhistories").find({ createdAt: range }).toArray(),
    db.collection("lottoperiods").find({ startDate: range }).toArray(),
    db.collection("lottotickets").find({ createdAt: range }).toArray(),
    db.collection("scratchtickets").find({ createdAt: range }).toArray(),
    db.collection("racingtickets").find({ createdAt: range }).toArray(),
    db.collection("quizattempts").find({ createdAt: range }).toArray(),
    db.collection("transactions").find({ createdAt: range }).toArray(),
    db.collection("fueltransactions").find({ createdAt: range }).toArray(),
    db.collection("gallery_posts").find({ createdAt: range }).toArray(),
  ]);

  const rows = jobs.map(normalizeJobDocToRow);
  const logistics = aggregateDivisionRows(rows.filter((r) => !isCoachRow(r)), false);
  const coaches = aggregateDivisionRows(rows.filter((r) => isCoachRow(r)), true);

  const ecoBundle = aggregateEcosystem360({
    hasCoreFiles: true,
    hasMinigameFiles: true,
    hasCommerceFiles: true,
    hasSocialFiles: true,
    convoys,
    contracts,
    ncevents,
    coupons,
    giveaways,
    giveawayTickets,
    vouchers,
    pointHistories,
    lottoPeriods,
    lottoTickets,
    scratchTickets,
    racingTickets,
    quizAttempts,
    transactions,
    fuelTransactions,
    galleryPosts,
  });

  // Still attach local driverAudit / staffKpi / markdown if folder exists
  const dir = path.resolve(REPORT_ROOT, monthKey);
  const folderExists = dir.startsWith(REPORT_ROOT) && fs.existsSync(dir);
  const files = folderExists
    ? fs
        .readdirSync(dir, { withFileTypes: true })
        .filter((e) => e.isFile())
        .map((e) => e.name)
        .sort()
    : [];
  const extras = folderExists
    ? loadDriverAuditAndExtras(dir, files, includeMarkdown)
    : { driverAudit: emptyDriverAudit(), staffKpi: { available: false }, markdownReports: undefined };

  return {
    monthKey,
    label: formatMonthLabel(monthKey),
    source: "live_mongodb",
    folderExists,
    files,
    logistics,
    coaches,
    ...ecoBundle,
    driverAudit: extras.driverAudit,
    staffKpi: extras.staffKpi,
    ...(extras.markdownReports ? { markdownReports: extras.markdownReports } : {}),
  };
}

async function resolveMonthMetrics(
  db: Db,
  monthKey: string,
  source: "auto" | "file" | "live",
  includeMarkdown: boolean
): Promise<MonthReportMetrics> {
  if (source === "live") {
    return computeLiveMonthMetrics(db, monthKey, includeMarkdown);
  }
  const fromFiles = loadMonthMetricsFromFiles(monthKey, includeMarkdown);
  if (source === "file") {
    return fromFiles;
  }
  // auto: use files if jobhistories CSV exists, else compute live 360° from MongoDB
  if (fromFiles.logistics.available || fromFiles.coaches.available) {
    return fromFiles;
  }
  return computeLiveMonthMetrics(db, monthKey, includeMarkdown);
}

/**
 * Live Staff KPI calculation directly from MongoDB (100% aligned with nismara-logistics/lib/managerSalary.ts
 * + recruitment applications/registrations + pointhistories)
 */
async function computeLiveStaffKpi(db: Db, monthKey: string) {
  const { startOfMonth, endOfMonth } = getWibMonthDateRange(monthKey);

  const [staffUsers, salaryRecords] = await Promise.all([
    db
      .collection("users")
      .find(
        {
          $or: [
            { discordRole: { $in: ["manager", "admin"] } },
            { truckyRole: { $regex: "manajer|manager|owner|hr|staff|director|deputy", $options: "i" } },
          ],
        },
        { projection: { discordId: 1, name: 1, truckyId: 1, discordRole: 1, truckyRole: 1 } }
      )
      .toArray(),
    db.collection("managersalaryrecords").find({ month: monthKey }).toArray(),
  ]);

  const salaryById = new Map<string, any>();
  for (const r of salaryRecords) {
    if (r.managerId) salaryById.set(String(r.managerId), r);
  }

  const staffMap = new Map<string, any>();
  for (const u of staffUsers) {
    if (u.discordId) staffMap.set(String(u.discordId), u);
  }
  for (const managerId of salaryById.keys()) {
    if (!staffMap.has(managerId)) {
      const u = await db.collection("users").findOne({ discordId: managerId });
      staffMap.set(managerId, u || { discordId: managerId, name: `Staff ${managerId}` });
    }
  }

  const staffRows: any[] = [];

  for (const [managerId, u] of staffMap.entries()) {
    const [
      ticketsHandled,
      fleetOrdersHandled,
      fleetServicesHandled,
      convoys,
      contractsCreated,
      boostEventsCreated,
      modsReviewed,
      jobAgg,
      internPromotions,
      internEvaluations,
      appsHandled,
      appsAccepted,
      appsRejected,
      regsHandled,
      penaltyActions,
    ] = await Promise.all([
      db.collection("tickets").countDocuments({
        managerId,
        status: { $in: ["resolved", "closed"] },
        discordId: { $ne: managerId },
        updatedAt: { $gte: startOfMonth, $lt: endOfMonth },
      }),
      db.collection("fleetorders").countDocuments({
        managerId,
        status: "completed",
        buyerId: { $ne: managerId },
        updatedAt: { $gte: startOfMonth, $lt: endOfMonth },
      }),
      db.collection("fleetmaintenanceorders").countDocuments({
        managerId,
        status: { $in: ["completed", "in_service"] },
        discordId: { $ne: managerId },
        $or: [
          { maintenanceStartAt: { $gte: startOfMonth, $lt: endOfMonth } },
          { updatedAt: { $gte: startOfMonth, $lt: endOfMonth } },
        ],
      }),
      db
        .collection("convoylobby")
        .find({
          setBy: managerId,
          startDate: { $gte: startOfMonth, $lt: endOfMonth },
        })
        .toArray(),
      db.collection("contracts").countDocuments({
        setBy: managerId,
        $or: [
          { startDate: { $gte: startOfMonth, $lt: endOfMonth } },
          { setAt: { $gte: startOfMonth, $lt: endOfMonth } },
          { createdAt: { $gte: startOfMonth, $lt: endOfMonth } },
        ],
      }),
      db.collection("ncevents").countDocuments({
        setBy: managerId,
        $or: [
          { startDate: { $gte: startOfMonth, $lt: endOfMonth } },
          { setAt: { $gte: startOfMonth, $lt: endOfMonth } },
          { createdAt: { $gte: startOfMonth, $lt: endOfMonth } },
        ],
      }),
      db.collection("marketitems").countDocuments({
        reviewerId: managerId,
        status: { $in: ["approved", "rejected"] },
        sellerId: { $ne: managerId },
        updatedAt: { $gte: startOfMonth, $lt: endOfMonth },
      }),
      db
        .collection("jobhistories")
        .aggregate([
          {
            $match: {
              driverId: managerId,
              jobStatus: "COMPLETED",
              cancelPenaltyApplied: { $ne: true },
              completedAt: { $gte: startOfMonth, $lt: endOfMonth },
            },
          },
          { $group: { _id: null, totalKm: { $sum: "$distanceKm" }, totalJobs: { $sum: 1 } } },
        ])
        .toArray(),
      db.collection("internpromotions").countDocuments({
        managerId,
        internDiscordId: { $ne: managerId },
        promotedAt: { $gte: startOfMonth, $lt: endOfMonth },
      }),
      db.collection("driverevaluations").countDocuments({
        closedByManagerId: managerId,
        status: "closed",
        driverId: { $ne: managerId },
        closedAt: { $gte: startOfMonth, $lt: endOfMonth },
      }),
      db.collection("applications").countDocuments({
        "claimedBy.discordId": managerId,
        updatedAt: { $gte: startOfMonth, $lt: endOfMonth },
      }),
      db.collection("applications").countDocuments({
        "claimedBy.discordId": managerId,
        status: "Accepted",
        updatedAt: { $gte: startOfMonth, $lt: endOfMonth },
      }),
      db.collection("applications").countDocuments({
        "claimedBy.discordId": managerId,
        status: "Rejected",
        updatedAt: { $gte: startOfMonth, $lt: endOfMonth },
      }),
      db.collection("registrations").countDocuments({
        managerId,
        updatedAt: { $gte: startOfMonth, $lt: endOfMonth },
      }),
      db.collection("pointhistories").countDocuments({
        managerId,
        createdAt: { $gte: startOfMonth, $lt: endOfMonth },
      }),
    ]);

    const convoysHosted = convoys.length;
    let convoyParticipants = 0;
    for (const c of convoys) {
      if (Array.isArray(c.partisipan)) {
        convoyParticipants += c.partisipan.filter(
          (p: any) => p?.discordId && String(p.discordId) !== managerId
        ).length;
      }
    }
    const convoyPoints = convoysHosted * 2 + convoyParticipants;
    const distanceKm = round2(jobAgg[0]?.totalKm || 0);
    const totalJobs = jobAgg[0]?.totalJobs || 0;
    const distancePoints = Math.floor(distanceKm / 1000);

    const totalKpiPoints =
      ticketsHandled +
      fleetOrdersHandled +
      fleetServicesHandled +
      convoyPoints +
      contractsCreated * 5 +
      boostEventsCreated * 5 +
      modsReviewed * 2 +
      distancePoints +
      internPromotions * 3 +
      internEvaluations * 2;

    const sal = salaryById.get(managerId);

    staffRows.push({
      managerId,
      name: u.name || `Staff ${managerId}`,
      truckyRole: u.truckyRole || u.discordRole || "manager",
      totalKpiPoints,
      ticketsHandled,
      recruitmentHandled: appsHandled + regsHandled,
      appsAccepted,
      appsRejected,
      fleetOrdersHandled,
      fleetServicesHandled,
      convoysHosted,
      convoyParticipants,
      contractsCreated,
      boostEventsCreated,
      modsReviewed,
      internPromotions,
      internEvaluations,
      penaltyActions,
      distanceKm,
      totalJobs,
      distancePoints,
      payrollStatus: sal?.status || "UNCLAIMED",
      payrollNcGranted: sal?.rewardsGranted?.ncAmount || 0,
    });
  }

  staffRows.sort((a, b) => b.totalKpiPoints - a.totalKpiPoints || b.recruitmentHandled - a.recruitmentHandled);

  const sum = (key: string) => staffRows.reduce((acc, r) => acc + toNum(r[key]), 0);
  const teamTotals = {
    totalStaff: staffRows.length,
    activeStaffWithPoints: staffRows.filter((r) => r.totalKpiPoints > 0).length,
    totalKpiPoints: sum("totalKpiPoints"),
    avgKpiPoints: staffRows.length > 0 ? round2(sum("totalKpiPoints") / staffRows.length) : 0,
    ticketsHandled: sum("ticketsHandled"),
    recruitmentHandled: sum("recruitmentHandled"),
    appsAccepted: sum("appsAccepted"),
    appsRejected: sum("appsRejected"),
    fleetOrdersHandled: sum("fleetOrdersHandled"),
    fleetServicesHandled: sum("fleetServicesHandled"),
    convoysHosted: sum("convoysHosted"),
    contractsCreated: sum("contractsCreated"),
    boostEventsCreated: sum("boostEventsCreated"),
    modsReviewed: sum("modsReviewed"),
    internPromotions: sum("internPromotions"),
    internEvaluations: sum("internEvaluations"),
    penaltyActions: sum("penaltyActions"),
    totalDistanceKm: round2(sum("distanceKm")),
  };

  return {
    period: {
      monthKey,
      label: formatMonthLabel(monthKey),
      wibRange: { start: startOfMonth.toISOString(), end: endOfMonth.toISOString() },
    },
    source: "live_mongodb",
    generatedAt: new Date().toISOString(),
    teamTotals,
    staff: staffRows,
  };
}

function diffMetric(a: number, b: number) {
  const delta = round2(b - a);
  const pctChange = a === 0 ? (b === 0 ? 0 : null) : round2(((b - a) / Math.abs(a)) * 100);
  return { monthA: a, monthB: b, delta, pctChange };
}

function compareDivision(a: DivisionMetrics, b: DivisionMetrics, isCoach: boolean) {
  const base: Record<string, any> = {
    totalJobs: diffMetric(a.totalJobs, b.totalJobs),
    completedJobs: diffMetric(a.completedJobs, b.completedJobs),
    canceledJobs: diffMetric(a.canceledJobs, b.canceledJobs),
    completionRatePct: diffMetric(a.completionRatePct, b.completionRatePct),
    totalDistanceKm: diffMetric(a.totalDistanceKm, b.totalDistanceKm),
    avgDistanceKm: diffMetric(a.avgDistanceKm, b.avgDistanceKm),
    totalDurationHours: diffMetric(a.totalDurationHours, b.totalDurationHours),
    totalRevenueNC: diffMetric(a.totalRevenueNC, b.totalRevenueNC),
    totalXp: diffMetric(a.totalXp, b.totalXp),
    totalCostNC: diffMetric(a.totalCostNC, b.totalCostNC),
    totalDiscountNC: diffMetric(a.totalDiscountNC, b.totalDiscountNC),
    totalPenaltyPointsSystem: diffMetric(a.totalPenaltyPointsSystem, b.totalPenaltyPointsSystem),
  };
  if (isCoach) {
    base.totalPassengers = diffMetric(a.totalPassengers || 0, b.totalPassengers || 0);
    base.avgPassengersPerTrip = diffMetric(a.avgPassengersPerTrip || 0, b.avgPassengersPerTrip || 0);
    base.totalStops = diffMetric(a.totalStops || 0, b.totalStops || 0);
  } else {
    base.hardcoreJobs = diffMetric(a.hardcoreJobs, b.hardcoreJobs);
  }
  return base;
}

export function registerReportTools(server: McpServer, db: Db) {
  // 1. list_reports
  server.tool(
    "list_reports",
    "List all available monthly analytics (360°), driver audit, and staff KPI report folders under report/ (YYYY-MM, comparisons, quarterly)",
    {},
    async () => {
      try {
        if (!fs.existsSync(REPORT_ROOT)) {
          return {
            content: [{ type: "text", text: JSON.stringify({ monthly: [], comparisons: [], quarterly: [] }, null, 2) }],
          };
        }

        const entries = fs.readdirSync(REPORT_ROOT, { withFileTypes: true });
        const monthly: any[] = [];

        for (const entry of entries) {
          if (!entry.isDirectory() || !/^\d{4}-\d{2}$/.test(entry.name)) continue;
          const dirPath = path.join(REPORT_ROOT, entry.name);
          const files = fs
            .readdirSync(dirPath, { withFileTypes: true })
            .filter((f) => f.isFile())
            .map((f) => ({
              name: f.name,
              sizeBytes: fs.statSync(path.join(dirPath, f.name)).size,
            }));

          const names = files.map((f) => f.name.toLowerCase());
          monthly.push({
            monthKey: entry.name,
            label: formatMonthLabel(entry.name),
            fileCount: files.length,
            datasets: {
              jobhistories: names.some((n) => n.startsWith("data_jobhistories_")),
              driverAudit: names.some((n) => n.startsWith("audit_driver_")),
              staffKpi: names.some((n) => n.startsWith("staff_kpi_")),
              convoylobby: names.some((n) => n.startsWith("data_convoylobby_")),
              contracts: names.some((n) => n.startsWith("data_contracts_") || n.startsWith("data_contracthistories_")),
              ncevents: names.some((n) => n.startsWith("data_ncevents_")),
              coupons: names.some((n) => n.startsWith("data_coupons_")),
              giveaways: names.some((n) => n.startsWith("data_giveaways_")),
              vouchers: names.some((n) => n.startsWith("data_uservouchers_")),
              pointhistories: names.some((n) => n.startsWith("data_pointhistories_")),
              minigames: names.some(
                (n) =>
                  n.startsWith("data_lottotickets_") ||
                  n.startsWith("data_scratchtickets_") ||
                  n.startsWith("data_racingtickets_") ||
                  n.startsWith("data_quizattempts_")
              ),
              commerce: names.some(
                (n) => n.startsWith("data_transactions_") || n.startsWith("data_fueltransactions_")
              ),
              gallery: names.some((n) => n.startsWith("data_gallery_posts_")),
              markdownNarrative: names.some((n) => n.startsWith("laporan_")),
            },
            files,
          });
        }

        monthly.sort((a, b) => a.monthKey.localeCompare(b.monthKey));

        const listSubdir = (sub: string) => {
          const p = path.join(REPORT_ROOT, sub);
          if (!fs.existsSync(p)) return [];
          return fs
            .readdirSync(p, { withFileTypes: true })
            .filter((f) => f.isFile())
            .map((f) => f.name)
            .sort();
        };

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  reportRoot: "report/",
                  monthly,
                  comparisons: listSubdir("comparisons"),
                  quarterly: listSubdir("quarterly"),
                },
                null,
                2
              ),
            },
          ],
        };
      } catch (error: any) {
        return {
          content: [{ type: "text", text: `Error listing reports: ${error.message}` }],
          isError: true,
        };
      }
    }
  );

  // 2. get_monthly_report (360°: Logistics Truck vs Coaches Bus + Community/Giveaways/Vouchers + Minigames + Commerce/Fuel + Gallery)
  server.tool(
    "get_monthly_report",
    "Get 360° monthly analytics metrics separated by Logistics (Truck) vs Coaches (Bus/Passengers), plus Convoys, Contracts, Giveaways, Vouchers, Coupons, Minigames (Lotto/Scratchers/Racing/Quiz), Commerce (Transactions & Fuel Market), Gallery, Driver Audit, and Staff KPI. Supports reading report/YYYY-MM/ files or computing live from MongoDB.",
    {
      month: z
        .string()
        .describe("Target month, e.g. '2026-08', '2026-11', 'Agustus 2026', or 'November 2026'"),
      year: z
        .number()
        .optional()
        .describe("Optional year if omitted in 'month' parameter (e.g. 2026)"),
      source: z
        .enum(["auto", "file", "live"])
        .optional()
        .describe("Data source: 'auto' (use report/YYYY-MM/ if jobhistories CSV exists, else live MongoDB), 'live' (always query MongoDB 360°), or 'file' (read disk only). Default: 'auto'"),
      includeMarkdown: z
        .boolean()
        .optional()
        .describe("Include saved markdown reports (.md) from that month folder (default: true)"),
    },
    async ({ month, year, source = "auto", includeMarkdown = true }) => {
      try {
        const monthKey = normalizeMonthKey(month, year);
        if (!monthKey) {
          return {
            content: [{ type: "text", text: `Format bulan tidak dikenali: '${month}'. Gunakan mis. '2026-08' atau 'November 2026'.` }],
            isError: true,
          };
        }

        const metrics = await resolveMonthMetrics(db, monthKey, source, includeMarkdown);
        return {
          content: [{ type: "text", text: JSON.stringify(metrics, null, 2) }],
        };
      } catch (error: any) {
        return {
          content: [{ type: "text", text: `Error reading monthly report: ${error.message}` }],
          isError: true,
        };
      }
    }
  );

  // 3. compare_monthly_reports
  server.tool(
    "compare_monthly_reports",
    "Compare Month A vs Month B 360° performance side-by-side (separated Logistics Truck vs Coaches Bus, Community/Giveaways/Vouchers, Minigames, Commerce/Fuel, Gallery, Driver Audit, and Staff KPI) with exact deltas and % growth",
    {
      monthA: z.string().describe("Baseline month (Month A), e.g. '2026-10' or 'Oktober 2026'"),
      monthB: z.string().describe("Comparison month (Month B), e.g. '2026-11' or 'November 2026'"),
      source: z
        .enum(["auto", "file", "live"])
        .optional()
        .describe("Data source: 'auto' (file if exists else live MongoDB), 'live' (always query MongoDB), or 'file' (disk only). Default: 'auto'"),
    },
    async ({ monthA, monthB, source = "auto" }) => {
      try {
        const keyA = normalizeMonthKey(monthA);
        const keyB = normalizeMonthKey(monthB);
        if (!keyA || !keyB) {
          return {
            content: [
              {
                type: "text",
                text: `Format bulan tidak dikenali (monthA='${monthA}', monthB='${monthB}'). Gunakan mis. '2026-10' dan '2026-11'.`,
              },
            ],
            isError: true,
          };
        }

        const [a, b] = await Promise.all([
          resolveMonthMetrics(db, keyA, source, false),
          resolveMonthMetrics(db, keyB, source, false),
        ]);

        const comparison: Record<string, any> = {
          periodA: { monthKey: a.monthKey, label: a.label, source: a.source, folderExists: a.folderExists },
          periodB: { monthKey: b.monthKey, label: b.label, source: b.source, folderExists: b.folderExists },
          logisticsTruckComparison:
            a.logistics.available && b.logistics.available
              ? compareDivision(a.logistics, b.logistics, false)
              : {
                  available: false,
                  note: `Dataset jobhistories belum lengkap untuk kedua bulan (${a.monthKey}: ${a.logistics.available}, ${b.monthKey}: ${b.logistics.available}).`,
                },
          coachesBusComparison:
            a.coaches.available || b.coaches.available
              ? compareDivision(a.coaches, b.coaches, true)
              : {
                  available: false,
                  note: "Belum ada aktivitas Divisi Coaches (DLC dirilis 12 November 2026) pada kedua bulan tersebut.",
                },
          ecosystemComparison:
            a.ecosystem.available && b.ecosystem.available
              ? {
                  convoysCount: diffMetric(a.ecosystem.convoysCount, b.ecosystem.convoysCount),
                  convoyParticipantsTotal: diffMetric(a.ecosystem.convoyParticipantsTotal, b.ecosystem.convoyParticipantsTotal),
                  contractsCount: diffMetric(a.ecosystem.contractsCount, b.ecosystem.contractsCount),
                  specialContractJobs: diffMetric(a.ecosystem.specialContractJobs, b.ecosystem.specialContractJobs),
                  specialContractNC: diffMetric(a.ecosystem.specialContractNC, b.ecosystem.specialContractNC),
                  ncBoostEventsCount: diffMetric(a.ecosystem.ncBoostEventsCount, b.ecosystem.ncBoostEventsCount),
                  ncBoostParticipantsTotal: diffMetric(a.ecosystem.ncBoostParticipantsTotal, b.ecosystem.ncBoostParticipantsTotal),
                  giveawaysCount: diffMetric(a.ecosystem.giveawaysCount, b.ecosystem.giveawaysCount),
                  giveawayTicketsCount: diffMetric(a.ecosystem.giveawayTicketsCount, b.ecosystem.giveawayTicketsCount),
                  giveawayWinnersCount: diffMetric(a.ecosystem.giveawayWinnersCount, b.ecosystem.giveawayWinnersCount),
                  giveawayNcBurned: diffMetric(a.ecosystem.giveawayNcBurned, b.ecosystem.giveawayNcBurned),
                  vouchersIssuedCount: diffMetric(a.ecosystem.vouchersIssuedCount, b.ecosystem.vouchersIssuedCount),
                  vouchersUsedCount: diffMetric(a.ecosystem.vouchersUsedCount, b.ecosystem.vouchersUsedCount),
                  couponsCount: diffMetric(a.ecosystem.couponsCount, b.ecosystem.couponsCount),
                  couponClaimsCount: diffMetric(a.ecosystem.couponClaimsCount, b.ecosystem.couponClaimsCount),
                  penaltyPointsAdded: diffMetric(a.ecosystem.penaltyPointsAdded, b.ecosystem.penaltyPointsAdded),
                  penaltyPointsRemoved: diffMetric(a.ecosystem.penaltyPointsRemoved, b.ecosystem.penaltyPointsRemoved),
                }
              : {
                  available: false,
                  note: `Dataset ekosistem belum lengkap untuk kedua bulan (${a.monthKey}: ${a.ecosystem.available}, ${b.monthKey}: ${b.ecosystem.available}).`,
                },
          minigamesComparison:
            a.minigames.available && b.minigames.available
              ? {
                  lottoTicketsCount: diffMetric(a.minigames.lottoTicketsCount, b.minigames.lottoTicketsCount),
                  lottoPrizeWonNC: diffMetric(a.minigames.lottoPrizeWonNC, b.minigames.lottoPrizeWonNC),
                  scratchTicketsCount: diffMetric(a.minigames.scratchTicketsCount, b.minigames.scratchTicketsCount),
                  scratchSpentNC: diffMetric(a.minigames.scratchSpentNC, b.minigames.scratchSpentNC),
                  scratchPrizeWonNC: diffMetric(a.minigames.scratchPrizeWonNC, b.minigames.scratchPrizeWonNC),
                  scratchNetBurnNC: diffMetric(a.minigames.scratchNetBurnNC, b.minigames.scratchNetBurnNC),
                  racingTicketsCount: diffMetric(a.minigames.racingTicketsCount, b.minigames.racingTicketsCount),
                  racingBetNC: diffMetric(a.minigames.racingBetNC, b.minigames.racingBetNC),
                  racingPrizeWonNC: diffMetric(a.minigames.racingPrizeWonNC, b.minigames.racingPrizeWonNC),
                  racingNetBurnNC: diffMetric(a.minigames.racingNetBurnNC, b.minigames.racingNetBurnNC),
                  quizAttemptsCount: diffMetric(a.minigames.quizAttemptsCount, b.minigames.quizAttemptsCount),
                  quizPassedCount: diffMetric(a.minigames.quizPassedCount, b.minigames.quizPassedCount),
                }
              : { available: false, note: "Dataset minigames belum lengkap di kedua bulan (gunakan source: 'live' untuk tarik langsung dari MongoDB)." },
          commerceAndSocialComparison:
            a.commerce.available && b.commerce.available
              ? {
                  transactionsCount: diffMetric(a.commerce.transactionsCount, b.commerce.transactionsCount),
                  totalSpentNC: diffMetric(a.commerce.totalSpentNC, b.commerce.totalSpentNC),
                  totalSpentIDR: diffMetric(a.commerce.totalSpentIDR, b.commerce.totalSpentIDR),
                  totalVoucherDiscountNC: diffMetric(a.commerce.totalVoucherDiscountNC, b.commerce.totalVoucherDiscountNC),
                  fuelTransactionsCount: diffMetric(a.commerce.fuelTransactionsCount, b.commerce.fuelTransactionsCount),
                  fuelTotalLiters: diffMetric(a.commerce.fuelTotalLiters, b.commerce.fuelTotalLiters),
                  fuelTotalVolumeNC: diffMetric(a.commerce.fuelTotalVolumeNC, b.commerce.fuelTotalVolumeNC),
                  fuelTotalFeeNC: diffMetric(a.commerce.fuelTotalFeeNC, b.commerce.fuelTotalFeeNC),
                  galleryPostsCount: diffMetric(a.social.galleryPostsCount, b.social.galleryPostsCount),
                  galleryTotalLikes: diffMetric(a.social.galleryTotalLikes, b.social.galleryTotalLikes),
                }
              : { available: false, note: "Dataset transaksi/BBM/galeri belum lengkap di kedua bulan (gunakan source: 'live' untuk tarik langsung dari MongoDB)." },
          driverAuditComparison:
            a.driverAudit.available && b.driverAudit.available
              ? {
                  totalDrivers: diffMetric(a.driverAudit.totalDrivers, b.driverAudit.totalDrivers),
                  passedCount: diffMetric(a.driverAudit.passedCount, b.driverAudit.passedCount),
                  complianceRatePct: diffMetric(a.driverAudit.complianceRatePct, b.driverAudit.complianceRatePct),
                  failedActiveCount: diffMetric(a.driverAudit.failedActiveCount, b.driverAudit.failedActiveCount),
                  failedOnLeaveCount: diffMetric(a.driverAudit.failedOnLeaveCount, b.driverAudit.failedOnLeaveCount),
                  missingUserCount: diffMetric(a.driverAudit.missingUserCount, b.driverAudit.missingUserCount),
                  totalFleetKm: diffMetric(a.driverAudit.totalFleetKm, b.driverAudit.totalFleetKm),
                  totalFleetJobs: diffMetric(a.driverAudit.totalFleetJobs, b.driverAudit.totalFleetJobs),
                  avgKmPerDriver: diffMetric(a.driverAudit.avgKmPerDriver, b.driverAudit.avgKmPerDriver),
                }
              : {
                  available: false,
                  note: `Dataset audit_driver_*.csv belum lengkap untuk kedua bulan (${a.monthKey}: ${a.driverAudit.available}, ${b.monthKey}: ${b.driverAudit.available}).`,
                },
          staffKpiComparison:
            a.staffKpi?.available && b.staffKpi?.available && a.staffKpi.teamTotals && b.staffKpi.teamTotals
              ? {
                  totalKpiPoints: diffMetric(a.staffKpi.teamTotals.totalKpiPoints, b.staffKpi.teamTotals.totalKpiPoints),
                  ticketsHandled: diffMetric(a.staffKpi.teamTotals.ticketsHandled, b.staffKpi.teamTotals.ticketsHandled),
                  recruitmentHandled: diffMetric(a.staffKpi.teamTotals.recruitmentHandled, b.staffKpi.teamTotals.recruitmentHandled),
                  fleetOrdersHandled: diffMetric(a.staffKpi.teamTotals.fleetOrdersHandled, b.staffKpi.teamTotals.fleetOrdersHandled),
                  fleetServicesHandled: diffMetric(a.staffKpi.teamTotals.fleetServicesHandled, b.staffKpi.teamTotals.fleetServicesHandled),
                  convoysHosted: diffMetric(a.staffKpi.teamTotals.convoysHosted, b.staffKpi.teamTotals.convoysHosted),
                  internPromotions: diffMetric(a.staffKpi.teamTotals.internPromotions, b.staffKpi.teamTotals.internPromotions),
                  internEvaluations: diffMetric(a.staffKpi.teamTotals.internEvaluations, b.staffKpi.teamTotals.internEvaluations),
                }
              : {
                  available: false,
                  note: "File staff_kpi_*.json belum tersedia di kedua bulan. Gunakan tool get_staff_kpi_report (dengan saveToReport: true) atau jalankan nismara_analytics_staff_kpi.ipynb.",
                },
          rawDetails: { monthA: a, monthB: b },
        };

        return {
          content: [{ type: "text", text: JSON.stringify(comparison, null, 2) }],
        };
      } catch (error: any) {
        return {
          content: [{ type: "text", text: `Error comparing monthly reports: ${error.message}` }],
          isError: true,
        };
      }
    }
  );

  // 4. get_staff_kpi_report
  server.tool(
    "get_staff_kpi_report",
    "Get Staff/Manager KPI performance report for a specific month (tickets, recruitment applications/registrations, fleet orders/services, convoys, special contracts, NC boost, mod reviews, intern evaluations/promotions, driving KM, and payroll claim status). Reads from report/YYYY-MM/staff_kpi_*.json or computes live from MongoDB.",
    {
      month: z.string().describe("Target month, e.g. '2026-10', '2026-11', or 'Oktober 2026'"),
      year: z.number().optional().describe("Optional year if omitted in 'month'"),
      source: z
        .enum(["auto", "live", "file"])
        .optional()
        .describe("Data source: 'auto' (file if exists else live MongoDB), 'live' (always query MongoDB), or 'file' (read report/YYYY-MM/ only). Default: 'auto'"),
      saveToReport: z
        .boolean()
        .optional()
        .describe("If computed live, save staff_kpi_<bulan>_<tahun>.json into report/YYYY-MM/ (default: false)"),
    },
    async ({ month, year, source = "auto", saveToReport = false }) => {
      try {
        const monthKey = normalizeMonthKey(month, year);
        if (!monthKey) {
          return {
            content: [{ type: "text", text: `Format bulan tidak dikenali: '${month}'. Gunakan mis. '2026-10' atau 'Oktober 2026'.` }],
            isError: true,
          };
        }

        const dir = path.resolve(REPORT_ROOT, monthKey);
        if (source !== "live" && dir.startsWith(REPORT_ROOT) && fs.existsSync(dir)) {
          const staffFile = fs
            .readdirSync(dir)
            .find((f) => f.toLowerCase().startsWith("staff_kpi_") && f.toLowerCase().endsWith(".json"));
          if (staffFile) {
            const saved = readJsonObject(path.join(dir, staffFile));
            if (saved) {
              return {
                content: [{ type: "text", text: JSON.stringify({ ...saved, source: `file:${monthKey}/${staffFile}` }, null, 2) }],
              };
            }
          }
          if (source === "file") {
            return {
              content: [{ type: "text", text: `File staff_kpi_*.json tidak ditemukan di report/${monthKey}/.` }],
              isError: true,
            };
          }
        }

        const liveReport = await computeLiveStaffKpi(db, monthKey);

        if (saveToReport) {
          fs.mkdirSync(dir, { recursive: true });
          const [, mStr] = monthKey.split("-");
          const monthSlug = (NUM_TO_MONTH_NAME[Number(mStr)] || mStr).toLowerCase();
          const yearStr = monthKey.split("-")[0];
          const outPath = path.join(dir, `staff_kpi_${monthSlug}_${yearStr}.json`);
          fs.writeFileSync(outPath, JSON.stringify(liveReport, null, 2), "utf-8");
        }

        return {
          content: [{ type: "text", text: JSON.stringify(liveReport, null, 2) }],
        };
      } catch (error: any) {
        return {
          content: [{ type: "text", text: `Error generating staff KPI report: ${error.message}` }],
          isError: true,
        };
      }
    }
  );
}
