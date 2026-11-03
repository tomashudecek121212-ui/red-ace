export default async (request) => {
  const headers = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Cache-Control": "no-store"
  };

  const respond = (status, data) =>
    new Response(JSON.stringify(data), {
      status,
      headers
    });

  if (request.method !== "GET") {
    return respond(405, { error: "Method not allowed" });
  }

  const apiKey = process.env.REDACE;

  if (!apiKey) {
    return respond(500, {
      error: "Missing REDACE environment variable in Netlify"
    });
  }

  const url = new URL(request.url);
  const date = url.searchParams.get("date");

  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return respond(400, {
      error: "Invalid date. Use YYYY-MM-DD."
    });
  }

  const parsedDate = new Date(`${date}T00:00:00Z`);

  if (
    Number.isNaN(parsedDate.getTime()) ||
    parsedDate.toISOString().slice(0, 10) !== date
  ) {
    return respond(400, { error: "Invalid calendar date." });
  }

  if (date > new Date().toISOString().slice(0, 10)) {
    return respond(400, {
      error: "Future dates are not supported."
    });
  }

  const apiUrl = new URL(
    "https://www.financecalendar.com/wp-json/fc/v1/calendar"
  );

  apiUrl.searchParams.set("from", date);
  apiUrl.searchParams.set("to", date);
  apiUrl.searchParams.set("country", "US,EU,GB,AU,NZ,JP");
  apiUrl.searchParams.set("impact", "high,medium,low");
  apiUrl.searchParams.set("limit", "500");
  apiUrl.searchParams.set("tz", "Europe/Bratislava");
  apiUrl.searchParams.set("format", "json");

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    let response;

    try {
      response = await fetch(apiUrl, {
        method: "GET",
        headers: {
          "X-API-Key": apiKey,
          "Accept": "application/json"
        },
        signal: controller.signal
      });
    } finally {
      clearTimeout(timeout);
    }

    const body = await response.text();

    let data;

    try {
      data = JSON.parse(body);
    } catch {
      return respond(502, {
        error: "Finance Calendar returned invalid JSON."
      });
    }

    if (!response.ok) {
      return respond(response.status, {
        error: "Finance Calendar API request failed.",
        details: data
      });
    }

    const events = Array.isArray(data.events)
      ? data.events
      : [];

    return respond(200, {
      success: true,
      date,
      count: events.length,
      events,
      attribution:
        data.attribution || "Finance Calendar",
      source: "Finance Calendar API"
    });

  } catch (error) {
    return respond(502, {
      error: "Unable to connect to Finance Calendar API.",
      details: error.name === "AbortError"
        ? "Request timed out."
        : error.message
    });
  }
};
