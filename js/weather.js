const API_HEADERS={headers:{"Accept":"application/geo+json"}};
const POINTS_URL="https:"+"//"+"api.weather.gov"+"/points/44.5434,-68.4195";
const OPEN_METEO_URL="https:"+"//"+"api.open-meteo.com/v1/forecast?latitude=44.5434&longitude=-68.4195&current=temperature_2m,apparent_temperature,relative_humidity_2m,precipitation,weather_code,wind_speed_10m,wind_direction_10m&temperature_unit=fahrenheit&wind_speed_unit=mph&precipitation_unit=inch&daily=sunrise,sunset&forecast_days=2&timezone=America%2FNew_York";

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

function flight(temp,wind,condition){
  let state="good",reasons=[],t=(condition||"").toLowerCase();
  if(temp!=null&&temp<50){state="poor";reasons.push("cold temperature")}
  else if(temp!=null&&temp<57){state="limited";reasons.push("cool temperature")}
  if(wind!=null&&wind>=20){state="poor";reasons.push("strong wind")}
  else if(wind!=null&&wind>=12&&state!=="poor"){state="limited";reasons.push("breezy conditions")}
  if(/rain|snow|sleet|thunder|shower|drizzle/.test(t)){state="poor";reasons.push("precipitation")}
  if(!reasons.length) reasons.push("mild temperature, manageable wind and no significant precipitation");
  return {state,reasons}
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
  const now=new Date();
  const sunriseTime=sunrise ? new Date(sunrise) : null;
  const sunsetTime=sunset ? new Date(sunset) : null;
  const isDark=(sunriseTime && sunsetTime)
    ? (now < sunriseTime || now >= sunsetTime)
    : false;

  const temp=c.temperature_2m;
  const feels=c.apparent_temperature;
  const hum=c.relative_humidity_2m;
  const wind=c.wind_speed_10m;
  const windDir=degreesToCompass(c.wind_direction_10m);
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

  const f=flight(temp,wind,cond),badge=document.getElementById("flight-badge");

  if(isDark){
    badge.className="flight-badge poor";
    badge.textContent="🌙 NO FLIGHT";
    document.getElementById("flight-title").textContent="After sunset";
    document.getElementById("flight-reason").textContent=
      "Bees are normally not flying after dark. Weather conditions will be evaluated again during daylight.";
  } else {
    badge.className="flight-badge "+f.state;
    badge.textContent=f.state==="good"?"🟢 GOOD":f.state==="limited"?"🟡 LIMITED":"🔴 POOR";

    document.getElementById("flight-title").textContent=
      f.state==="good"?"Weather supports bee flight":
      f.state==="limited"?"Flight may be reduced":
      "Weather is unfavorable for flight";

    document.getElementById("flight-reason").textContent=
      "Based on "+f.reasons.join(", ")+".";
  }

  const fc=document.getElementById("forecast");
  fc.innerHTML="";

  periods.slice(0,5).forEach(p=>{
    fc.insertAdjacentHTML("beforeend",
      `<div class="forecast-day"><b>${p.name}</b><span class="fi">${iconFor(p.shortForecast)}</span><span class="temps">${p.temperature}°${p.temperatureUnit}</span><small>${p.shortForecast}</small></div>`
    );
  });

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
 }
}

loadWeather();
setInterval(loadWeather,15*60*1000);
