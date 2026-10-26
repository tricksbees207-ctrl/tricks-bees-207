const API_HEADERS={headers:{"Accept":"application/geo+json"}};
const POINTS_URL="https:"+"//"+"api.weather.gov"+"/points/44.5434,-68.4195";
const OPEN_METEO_URL="https:"+"//"+"api.open-meteo.com/v1/forecast?latitude=44.5434&longitude=-68.4195&current=temperature_2m,apparent_temperature,relative_humidity_2m,precipitation,weather_code,wind_speed_10m,wind_direction_10m,wind_gusts_10m,cloud_cover,visibility&temperature_unit=fahrenheit&wind_speed_unit=mph&precipitation_unit=inch&daily=sunrise,sunset&forecast_days=2&timezone=America%2FNew_York";

function iconFor(text){
  text=(text||"").toLowerCase();
  if(text.includes("thunder")) return "⛈️";
  if(text.includes("snow")||text.includes("sleet")) return "🌨️";
  if(text.includes("rain")||text.includes("shower")||text.includes("drizzle")) return "🌧️";
  if(text.includes("fog")) return "🌫️";
  if(text.includes("cloud")||text.includes("overcast")) return "☁️";
  if(text.includes("partly")||text.includes("mostly sunny")) return "🌤️";
  return "☀️";
}

function weatherCodeText(code){
  const map={
    0:"Clear",
    1:"Mainly clear",
    2:"Partly cloudy",
    3:"Overcast",
    45:"Fog",
    48:"Depositing rime fog",
    51:"Light drizzle",
    53:"Drizzle",
    55:"Heavy drizzle",
    56:"Light freezing drizzle",
    57:"Heavy freezing drizzle",
    61:"Light rain",
    63:"Rain",
    65:"Heavy rain",
    66:"Light freezing rain",
    67:"Heavy freezing rain",
    71:"Light snow",
    73:"Snow",
    75:"Heavy snow",
    77:"Snow grains",
    80:"Light rain showers",
    81:"Rain showers",
    82:"Heavy rain showers",
    85:"Light snow showers",
    86:"Heavy snow showers",
    95:"Thunderstorm",
    96:"Thunderstorm with slight hail",
    99:"Thunderstorm with heavy hail"
  };
  return map[code] || "Current conditions";
}

function degreesToCompass(deg){
  if(deg==null) return "";
  const dirs=["N","NNE","NE","ENE","E","ESE","SE","SSE",
              "S","SSW","SW","WSW","W","WNW","NW","NNW"];
  return dirs[Math.round(deg/22.5)%16];
}

function flight(temp,wind,condition,{gust,cloud,humidity,visibility}={}){
  let state="good",reasons=[],t=(condition||"").toLowerCase();
  const limit=()=>{if(state==="good") state="limited";};
  if(temp!=null&&temp<50){state="poor";reasons.push("cold temperature")}
  else if(temp!=null&&temp<57){limit();reasons.push("cool temperature")}
  if(wind!=null&&wind>=20){state="poor";reasons.push("strong sustained wind")}
  else if(wind!=null&&wind>=12){limit();reasons.push("breezy conditions")}
  if(gust!=null&&gust>=25){state="poor";reasons.push("strong wind gusts")}
  else if(gust!=null&&gust>=18){limit();reasons.push("gusty winds")}
  if(/thunder/.test(t)){state="poor";reasons.push("thunderstorms")}
  else if(/rain|snow|sleet|shower|drizzle/.test(t)){state="poor";reasons.push("precipitation")}
  if(/fog/.test(t)||(visibility!=null&&visibility<1000)){limit();reasons.push("fog or reduced visibility")}
  if(cloud!=null&&cloud>=85&&temp!=null&&temp<65){limit();reasons.push("heavy cloud cover in cool weather")}
  if(humidity!=null&&humidity>=90&&cloud!=null&&cloud>=75&&temp!=null&&temp<65){
    limit();reasons.push("high humidity with cool, overcast conditions");
  }
  if(temp!=null&&temp>=95){limit();reasons.push("extreme heat")}
  if(!reasons.length) reasons.push("temperature, wind and sky conditions generally support flight");
  return {state,reasons};
}

async function getNWS(url){
  const r=await fetch(url,API_HEADERS);
  if(!r.ok) throw new Error("NWS request failed ("+r.status+")");
  return r.json();
}

async function getOpenMeteo(){
  const r=await fetch(OPEN_METEO_URL);
  if(!r.ok) throw new Error("Open-Meteo request failed ("+r.status+")");
  return r.json();
}

function flightSummary(result){
  if(result.state==="good") return "Conditions generally support bee flight.";
  const priority=[
    "thunderstorms","precipitation","cold temperature","strong sustained wind",
    "strong wind gusts","cool temperature","gusty winds","breezy conditions",
    "fog or reduced visibility","extreme heat","heavy cloud cover in cool weather",
    "high humidity with cool, overcast conditions"
  ];
  const severe=new Set(priority.slice(0,5));
  const ranked=priority.filter(reason=>result.reasons.includes(reason));
  const candidates=(result.state==="poor"?ranked.filter(reason=>severe.has(reason)):ranked).filter(reason=>
    reason!=="high humidity with cool, overcast conditions"||!ranked.includes("heavy cloud cover in cool weather"));
  const selected=(candidates.length?candidates:ranked).slice(0,2);
  return (selected.length===1?"Main limit: ":"Main limits: ")+selected.join("; ")+".";
}
function cTime(value){return typeof value==="string" ? value : "";}
function formatMaineTime(value){
  // Open-Meteo provides local Maine times in YYYY-MM-DDTHH:mm form.
  const hhmm=typeof value==="string"?value.slice(11,16):"";
  if(hhmm.length!==5||hhmm[2]!==":"||Number.isNaN(Number(hhmm.slice(0,2)))||Number.isNaN(Number(hhmm.slice(3,5)))) return "";
  const hour=Number(hhmm.slice(0,2));
  return (hour%12||12)+":"+hhmm.slice(3,5)+(hour>=12?" PM":" AM");
}


async function loadWeather(){
 try{
  document.getElementById("weather-status").textContent="Loading live weather data…";

  const point=await getNWS(POINTS_URL);
  const forecastURL=point.properties.forecast;

  const [forecast,live]=await Promise.all([
    getNWS(forecastURL),
    getOpenMeteo()
  ]);

  const periods=forecast.properties.periods||[];
  const c=live.current||{};
  const sunrise=live.daily?.sunrise?.[0];
  const sunset=live.daily?.sunset?.[0];
  // Open-Meteo returns these times in Ellsworth local time. Compare local ISO strings
  // directly so a visitor's computer timezone cannot change the flight estimate.
  const localTime=cTime(live.current?.time);
  const beforeSunrise=Boolean(localTime&&sunrise&&localTime<sunrise);
  const afterSunset=Boolean(localTime&&sunset&&localTime>=sunset);
  const isDark=beforeSunrise||afterSunset;

  const temp=c.temperature_2m;
  const feels=c.apparent_temperature;
  const hum=c.relative_humidity_2m;
  const wind=c.wind_speed_10m;
  const windDir=degreesToCompass(c.wind_direction_10m);
  const gust=c.wind_gusts_10m;
  const cloud=c.cloud_cover;
  const visibility=c.visibility;
  const cond=weatherCodeText(c.weather_code);

  let observationTime=c.time ? new Date(c.time) : null;
  let timeText=observationTime && !Number.isNaN(observationTime.getTime())
    ? observationTime.toLocaleTimeString([], {hour:"numeric",minute:"2-digit"})
    : "current";

  document.getElementById("weather-status").textContent=
    "Current conditions: Open-Meteo • "+timeText+" • Forecast: National Weather Service";

  document.getElementById("wx-icon").textContent=iconFor(cond);
  document.getElementById("wx-temp").textContent=temp==null?"Unavailable":Math.round(temp)+"°F";
  document.getElementById("wx-condition").textContent=cond;
  document.getElementById("wx-feels").textContent=feels==null?"Unavailable":Math.round(feels)+"°F";
  document.getElementById("wx-humidity").textContent=hum==null?"Unavailable":Math.round(hum)+"%";

  document.getElementById("wx-wind").textContent=
    wind==null?"Unavailable":Math.round(wind)+" mph"+(windDir?" "+windDir:"");

  const pop=periods[0]?.probabilityOfPrecipitation?.value;
  document.getElementById("wx-precip").textContent=
    pop==null?"Unavailable":Math.round(pop)+"% chance";

  const f=flight(temp,wind,cond,{gust,cloud,humidity:hum,visibility});
  const badge=document.getElementById("flight-badge");
  const setFlightFactor=(id,value)=>{const el=document.getElementById(id);if(el)el.textContent=value;};
  setFlightFactor("flight-gusts",gust==null?"Unavailable":Math.round(gust)+" mph");
  setFlightFactor("flight-clouds",cloud==null?"Unavailable":Math.round(cloud)+"%");
  setFlightFactor("flight-visibility",visibility==null?"Unavailable":
    visibility<1000?Math.round(visibility)+" m":(visibility/1609.344).toFixed(1)+" mi");
  setFlightFactor("flight-daylight",beforeSunrise?"Before sunrise":afterSunset?"After sunset":
    sunrise&&sunset?"Daytime":"Unavailable");
  const riseLabel=formatMaineTime(sunrise),setLabel=formatMaineTime(sunset);
  setFlightFactor("flight-sun-times",riseLabel&&setLabel?riseLabel+" / "+setLabel:"Unavailable");

  if(isDark){
    badge.className="flight-badge poor";
    badge.textContent="🌙 NO FLIGHT";
    document.getElementById("flight-title").textContent=beforeSunrise ? "Before sunrise" : "After sunset";
    document.getElementById("flight-reason").textContent=
      "Normal foraging is unlikely until daylight.";
  } else {
    badge.className="flight-badge "+f.state;
    badge.textContent=f.state==="good"?"🟢 GOOD":f.state==="limited"?"🟡 LIMITED":"🔴 POOR";

    document.getElementById("flight-title").textContent=
      f.state==="good"?"Weather supports bee flight":
      f.state==="limited"?"Flight may be reduced":
      "Weather is unfavorable for flight";

    document.getElementById("flight-reason").textContent=
      flightSummary(f);
  }

  const fc=document.getElementById("forecast");
  fc.innerHTML="";

  // NWS divides each day into daytime and nighttime forecast periods.
  // Group those periods by Maine calendar date so five cards mean five days.
  const forecastDays = new Map();
  for (const period of periods) {
    const date = period.startTime?.slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
    if (!forecastDays.has(date)) forecastDays.set(date, { date, day: null, night: null });
    forecastDays.get(date)[period.isDaytime ? "day" : "night"] = period;
  }

  [...forecastDays.values()].slice(0, 5).forEach(({date, day, night}) => {
    const primary = day || night;
    const label = new Date(date + "T12:00:00Z").toLocaleDateString("en-US", {
      timeZone: "UTC", weekday: "short", month: "short", day: "numeric"
    });
    const temperatures = [
      day ? "High " + day.temperature + "°" + day.temperatureUnit : "",
      night ? "Low " + night.temperature + "°" + night.temperatureUnit : ""
    ].filter(Boolean).join(" / ");
    const summary = primary.shortForecast || "Forecast available";
    const forecastIcon = !day && /clear|sunny/i.test(summary) ? "🌙" : iconFor(summary);

    fc.insertAdjacentHTML("beforeend",
      `<div class="forecast-day"><b>${label}</b><span class="fi">${forecastIcon}</span><span class="temps">${temperatures}</span><small>${summary}</small></div>`
    );
  });
  if (!forecastDays.size) fc.textContent = "Daily forecast temporarily unavailable.";

 }catch(e){
  console.error(e);
  document.getElementById("weather-status").textContent="Weather temporarily unavailable.";
  ["wx-temp","wx-feels","wx-humidity","wx-wind","wx-precip"].forEach(
    id=>document.getElementById(id).textContent="Unavailable"
  );
  document.getElementById("wx-condition").textContent="Could not reach the weather services";
  document.getElementById("flight-badge").className="flight-badge limited";
  document.getElementById("flight-badge").textContent="WEATHER UNAVAILABLE";
  document.getElementById("flight-title").textContent="Bee flight guide unavailable";
  document.getElementById("flight-reason").textContent=
    "The live weather service could not be reached. The page will try again automatically.";
  ["flight-gusts","flight-clouds","flight-visibility","flight-daylight","flight-sun-times"].forEach(
    id=>{const el=document.getElementById(id);if(el)el.textContent="Unavailable";}
  );
 }
}

loadWeather();
setInterval(loadWeather,15*60*1000);
