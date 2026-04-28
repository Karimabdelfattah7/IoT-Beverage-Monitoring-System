/**
 * Backend API Server
 *
 * This Express server connects the React dashboard to InfluxDB.
 * It queries time-series data for the Dispenser, Booster, and Chiller
 * subsystems and returns formatted JSON for summary cards and charts.
 *
 * Key Responsibilities:
 * - Load backend configuration from environment variables
 * - Connect to InfluxDB using the official client
 * - Query subsystem measurements by field and time range
 * - Summarize telemetry data for dashboard metrics
 * - Provide REST API endpoints for frontend data requests
 * - Write maintenance events such as syrup replacement
 *
 * Technologies Used:
 * - Node.js / Express
 * - InfluxDB Client
 * - Flux queries
 * - CORS and dotenv
 */

const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const { InfluxDB, Point } = require("@influxdata/influxdb-client");

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 4000;
const INFLUX_URL = process.env.INFLUX_URL;
const INFLUX_TOKEN = process.env.INFLUX_TOKEN;
const INFLUX_ORG = process.env.INFLUX_ORG;
const INFLUX_BUCKET = process.env.INFLUX_BUCKET;

const DISPENSER_MEASUREMENT = process.env.INFLUX_DISPENSER_MEASUREMENT;
const BOOSTER_MEASUREMENT = process.env.INFLUX_BOOSTER_MEASUREMENT;
const CHILLER_MEASUREMENT = process.env.INFLUX_CHILLER_MEASUREMENT;

const DEFAULT_DEVICE = process.env.DEFAULT_DEVICE || "SX1262";

if (!INFLUX_URL || !INFLUX_TOKEN || !INFLUX_ORG || !INFLUX_BUCKET) {
  console.error("Missing InfluxDB environment variables.");
  process.exit(1);
}

const influxDB = new InfluxDB({
  url: INFLUX_URL,
  token: INFLUX_TOKEN,
  transportOptions: { timeout: 30000 },
});

const queryApi = influxDB.getQueryApi(INFLUX_ORG);

function getWriteApi() {
  return influxDB.getWriteApi(INFLUX_ORG, INFLUX_BUCKET, "ns");
}

function toNumber(value, digits = 2) {
  const num = Number(value);
  if (!Number.isFinite(num)) return 0;
  return Number(num.toFixed(digits));
}

function formatTimeLabel(value) {
  const d = new Date(value);
  return d.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

function collectRows(fluxQuery) {
  return new Promise((resolve, reject) => {
    const rows = [];
    queryApi.queryRows(fluxQuery, {
      next(row, tableMeta) {
        rows.push(tableMeta.toObject(row));
      },
      error(error) {
        reject(error);
      },
      complete() {
        resolve(rows);
      },
    });
  });
}

function getRangeStart(query = {}) {
  const allowedRanges = new Set(["15m", "1h", "6h", "24h", "7d", "30d"]);
  const range = typeof query.range === "string" ? query.range : "24h";

  if (allowedRanges.has(range)) {
    return { flux: `-${range}`, label: range };
  }

  return { flux: "-24h", label: "24h" };
}

async function queryRawSeries({ measurement, field, rangeStart }) {
  const fluxQuery = `
    from(bucket: "${INFLUX_BUCKET}")
      |> range(start: ${rangeStart})
      |> filter(fn: (r) => r._measurement == "${measurement}")
      |> filter(fn: (r) => r._field == "${field}")
      |> filter(fn: (r) => r.device == "${DEFAULT_DEVICE}")
      |> sort(columns: ["_time"])
  `;

  const rows = await collectRows(fluxQuery);

  return rows.map((row) => ({
    time: row._time,
    label: formatTimeLabel(row._time),
    value: toNumber(row._value),
  }));
}

function summarizeSeries(series = []) {
  const values = (Array.isArray(series) ? series : [])
    .map((item) => Number(item.value))
    .filter((value) => Number.isFinite(value));

  if (!values.length) {
    return {
      min: null,
      max: null,
      mean: null,
      latest: null,
      count: 0,
      total: 0,
    };
  }

  return {
    min: Math.min(...values),
    max: Math.max(...values),
    mean: values.reduce((sum, value) => sum + value, 0) / values.length,
    latest: values[values.length - 1],
    count: values.length,
    total: values.reduce((sum, value) => sum + value, 0),
  };
}

/* ---------------- HEALTH ---------------- */

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

/* ---------------- DISPENSER SUMMARY ---------------- */

app.get("/api/dispenser/summary", async (req, res) => {
  try {
    const { flux, label } = getRangeStart(req.query);

    const [syrup, water, duration, total, remaining] = await Promise.all([
      queryRawSeries({
        measurement: DISPENSER_MEASUREMENT,
        field: "syrup",
        rangeStart: flux,
      }),
      queryRawSeries({
        measurement: DISPENSER_MEASUREMENT,
        field: "water",
        rangeStart: flux,
      }),
      queryRawSeries({
        measurement: DISPENSER_MEASUREMENT,
        field: "duration",
        rangeStart: flux,
      }),
      queryRawSeries({
        measurement: DISPENSER_MEASUREMENT,
        field: "total",
        rangeStart: flux,
      }),
      queryRawSeries({
        measurement: DISPENSER_MEASUREMENT,
        field: "syrupRemaining",
        rangeStart: flux,
      }),
    ]);

    const waterStats = summarizeSeries(water);
    const durationStats = summarizeSeries(duration);
    const totalStats = summarizeSeries(total);
    const syrupStats = summarizeSeries(syrup);
    const remainingStats = summarizeSeries(remaining);

    const syrupRemaining = remainingStats.latest ?? 0;
    const syrupRemainingEnabled = remainingStats.count > 0;

    res.json({
      rangeLabel: label,
      syrupRemainingEnabled,
      syrupRemaining: toNumber(syrupRemaining, 2),
      waterUsedToday: toNumber(waterStats.total, 2),
      avgPressDuration: toNumber(durationStats.mean, 2),
      dispensesToday: durationStats.count,
      latestTotal: toNumber(totalStats.latest, 2),
      latestSyrup: toNumber(syrupStats.latest, 2),
    });
  } catch (err) {
    console.error("Dispenser summary error:", err);
    res.status(500).json({
      error: "Failed to load dispenser summary.",
      details: err.message,
    });
  }
});

/* ---------------- DISPENSER CHARTS ---------------- */

app.get("/api/dispenser/charts", async (req, res) => {
  try {
    const { flux, label } = getRangeStart(req.query);

    const [syrup, water, duration, total, remaining] = await Promise.all([
      queryRawSeries({
        measurement: DISPENSER_MEASUREMENT,
        field: "syrup",
        rangeStart: flux,
      }),
      queryRawSeries({
        measurement: DISPENSER_MEASUREMENT,
        field: "water",
        rangeStart: flux,
      }),
      queryRawSeries({
        measurement: DISPENSER_MEASUREMENT,
        field: "duration",
        rangeStart: flux,
      }),
      queryRawSeries({
        measurement: DISPENSER_MEASUREMENT,
        field: "total",
        rangeStart: flux,
      }),
      queryRawSeries({
        measurement: DISPENSER_MEASUREMENT,
        field: "syrupRemaining",
        rangeStart: flux,
      }),
    ]);

    res.json({
      rangeLabel: label,
      syrupSeries: syrup,
      waterSeries: water,
      durationSeries: duration,
      totalSeries: total,
      syrupRemainingSeries: remaining,
      hourlyWaterSeries: water,
    });
  } catch (err) {
    console.error("Dispenser charts error:", err);
    res.status(500).json({
      error: "Failed to load dispenser charts.",
      details: err.message,
    });
  }
});

/* ---------------- DISPENSER REPLACE SYRUP ---------------- */

app.post("/api/dispenser/replace-syrup", async (req, res) => {
  try {
    const device = req.body.device || DEFAULT_DEVICE;

    const writeApi = getWriteApi();

    const line = `dispenser_v2,device=SX1262 count=0,duration=0i,syrup=0.000,water=0.000,total=0.000,syrupRemaining=100`;

    writeApi.writeRecord(line);

    await writeApi.flush();
    await writeApi.close();

    res.json({
      success: true,
      message: "Line protocol written successfully.",
    });
  } catch (err) {
    console.error("Replace syrup error:", err);
    res.status(500).json({
      error: "Failed to write line protocol.",
      details: err.message,
    });
  }
});

/* ---------------- BOOSTER SUMMARY ---------------- */

app.get("/api/booster/summary", async (req, res) => {
  try {
    const { flux, label } = getRangeStart(req.query);

    const [current, power, temp] = await Promise.all([
      queryRawSeries({
        measurement: BOOSTER_MEASUREMENT,
        field: "current",
        rangeStart: flux,
      }),
      queryRawSeries({
        measurement: BOOSTER_MEASUREMENT,
        field: "power",
        rangeStart: flux,
      }),
      queryRawSeries({
        measurement: BOOSTER_MEASUREMENT,
        field: "temp",
        rangeStart: flux,
      }),
    ]);

    const currentStats = summarizeSeries(current);
    const powerStats = summarizeSeries(power);
    const tempStats = summarizeSeries(temp);

    let systemStatus = "Stable operation";
    if ((tempStats.latest ?? 0) > 34) {
      systemStatus = "Temperature elevated";
    }
    if (
      Math.abs(currentStats.latest ?? 0) > 1.6 ||
      Math.abs(powerStats.latest ?? 0) > 24
    ) {
      systemStatus = "High electrical load";
    }

    res.json({
      rangeLabel: label,
      latestCurrent: toNumber(currentStats.latest, 2),
      latestPower: toNumber(powerStats.latest, 2),
      latestTemperature: toNumber(tempStats.latest, 2),
      meanCurrent: toNumber(currentStats.mean, 2),
      readingCount: currentStats.count,
      systemStatus,
    });
  } catch (err) {
    console.error("Booster summary error:", err);
    res.status(500).json({
      error: "Failed to load booster summary.",
      details: err.message,
    });
  }
});

/* ---------------- BOOSTER CHARTS ---------------- */

app.get("/api/booster/charts", async (req, res) => {
  try {
    const { flux, label } = getRangeStart(req.query);

    const [current, power, temp] = await Promise.all([
      queryRawSeries({
        measurement: BOOSTER_MEASUREMENT,
        field: "current",
        rangeStart: flux,
      }),
      queryRawSeries({
        measurement: BOOSTER_MEASUREMENT,
        field: "power",
        rangeStart: flux,
      }),
      queryRawSeries({
        measurement: BOOSTER_MEASUREMENT,
        field: "temp",
        rangeStart: flux,
      }),
    ]);

    res.json({
      rangeLabel: label,
      currentSeries: current,
      powerSeries: power,
      temperatureSeries: temp,
      loadEventsSeries: power,
    });
  } catch (err) {
    console.error("Booster charts error:", err);
    res.status(500).json({
      error: "Failed to load booster charts.",
      details: err.message,
    });
  }
});

/* ---------------- CHILLER SUMMARY ---------------- */

app.get("/api/chiller/summary", async (req, res) => {
  try {
    const { flux, label } = getRangeStart(req.query);

    const [temp, ambient] = await Promise.all([
      queryRawSeries({
        measurement: CHILLER_MEASUREMENT,
        field: "temp",
        rangeStart: flux,
      }),
      queryRawSeries({
        measurement: CHILLER_MEASUREMENT,
        field: "ambient",
        rangeStart: flux,
      }),
    ]);

    const tempStats = summarizeSeries(temp);
    const ambientStats = summarizeSeries(ambient);

    let systemStatus = "Normal";
    if ((tempStats.latest ?? 0) > 12) {
      systemStatus = "Critical";
    } else if ((tempStats.latest ?? 0) > 8) {
      systemStatus = "Elevated";
    }

    res.json({
      rangeLabel: label,
      latestTemperature: toNumber(tempStats.latest, 2),
      latestAmbient: toNumber(ambientStats.latest, 2),
      meanTemperature: toNumber(tempStats.mean, 2),
      readingCount: tempStats.count,
      systemStatus,
    });
  } catch (err) {
    console.error("Chiller summary error:", err);
    res.status(500).json({
      error: "Failed to load chiller summary.",
      details: err.message,
    });
  }
});

/* ---------------- CHILLER CHARTS ---------------- */

app.get("/api/chiller/charts", async (req, res) => {
  try {
    const { flux, label } = getRangeStart(req.query);

    const [temp, ambient] = await Promise.all([
      queryRawSeries({
        measurement: CHILLER_MEASUREMENT,
        field: "temp",
        rangeStart: flux,
      }),
      queryRawSeries({
        measurement: CHILLER_MEASUREMENT,
        field: "ambient",
        rangeStart: flux,
      }),
    ]);

    res.json({
      rangeLabel: label,
      temperatureSeries: temp,
      ambientSeries: ambient,
    });
  } catch (err) {
    console.error("Chiller charts error:", err);
    res.status(500).json({
      error: "Failed to load chiller charts.",
      details: err.message,
    });
  }
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on http://192.168.0.78:${PORT}`);
});