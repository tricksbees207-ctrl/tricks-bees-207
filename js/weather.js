const API_HEADERS={headers:{"Accept":"application/geo+json"}};
const POINTS_URL="https:"+"//"+"api.weather.gov"+"/points/44.5434,-68.4195";

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
function cToF(c){return c==null?null:(c*9/5)+32}
function msToMph(v){return v==null?null:v*2.23694}
function parseNwsWindMph(text){
  if(!text) return null;
  const nums=String(text).match(/\d+(?:\.\d+)?/g);
  if(!nums||!nums.length) return null;
  return Number(nums[0]);
}
function humidityFromTempDewpoint(tempC,dewC){
  if(tempC==null||dewC==null) return null;
  const rh=100*Math.exp((17.625*dewC)/(243.04+dewC)-(17.625*tempC)/(243.04+tempC));
  return Math.max(0,Math.min(100,rh));
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
async function getJSON(url){
  const r=await fetch(url,API_HEADERS);
  if(!r.ok) throw new Error("NWS request failed ("+r.status+")");
  return r.json();
}
async function loadWeather(){
 try{
  document.getElementById("weather-status").textContent="Loading live National Weather Service data…";
  const point=await getJSON(POINTS_URL);
  const forecastURL=point.properties.forecast;
  const hourlyURL=point.properties.forecastHourly;
  const stationsURL=point.properties.observationStations;
  const [forecast,hourly,stations]=await Promise.all([getJSON(forecastURL),getJSON(hourlyURL),getJSON(stationsURL)]);
  const station=stations.features && stations.features[0] && stations.features[0].id;
  if(!station) throw new Error("No nearby observation station found");
  const obs=await getJSON(station+"/observations/latest");
  const o=obs.properties, periods=forecast.properties.periods||[];
  const temp=cToF(o.temperature&&o.temperature.value);
  const feels=cToF(o.heatIndex&&o.heatIndex.value) ?? cToF(o.windChill&&o.windChill.value) ?? temp;
  const reportedHum=o.relativeHumidity&&o.relativeHumidity.value;
  const dewC=o.dewpoint&&o.dewpoint.value;
  const tempC=o.temperature&&o.temperature.value;
  const calculatedHum=reportedHum==null?humidityFromTempDewpoint(tempC,dewC):reportedHum;
  const hourlyHum=hourly?.properties?.periods?.[0]?.relativeHumidity?.value;
  const hum=calculatedHum==null?hourlyHum:calculatedHum;
  const hourlyNow=hourly?.properties?.periods?.[0];
  const hourlyWind=parseNwsWindMph(hourlyNow?.windSpeed);
  const observedWind=msToMph(o.windSpeed&&o.windSpeed.value);
  const wind=hourlyWind==null?observedWind:hourlyWind;
  const windDir=hourlyNow?.windDirection || null;
  const observedGust=msToMph(o.windGust&&o.windGust.value);
  const cond=(o.textDescription||periods[0]?.shortForecast||"Current conditions");
  document.getElementById("weather-status").textContent="Live National Weather Service observation • "+new Date(o.timestamp).toLocaleTimeString([], {hour:"numeric",minute:"2-digit"});
  document.getElementById("wx-icon").textContent=iconFor(cond);
  document.getElementById("wx-temp").textContent=temp==null?"Unavailable":Math.round(temp)+"°F";
  document.getElementById("wx-condition").textContent=cond;
  document.getElementById("wx-feels").textContent=feels==null?"Unavailable":Math.round(feels)+"°F";
  document.getElementById("wx-humidity").textContent=hum==null?"Unavailable":Math.round(hum)+"%";
  let windText=wind==null?"Unavailable":Math.round(wind)+" mph"+(windDir?" "+windDir:"");
  if(observedGust!=null && wind!=null && observedGust>wind+3) windText += " · gusts "+Math.round(observedGust)+" mph";
  document.getElementById("wx-wind").textContent=windText;
  const pop=periods[0]?.probabilityOfPrecipitation?.value;
  document.getElementById("wx-precip").textContent=pop==null?"Unavailable":Math.round(pop)+"% chance";
  const f=flight(temp,wind,cond),badge=document.getElementById("flight-badge");
  badge.className="flight-badge "+f.state;
  badge.textContent=f.state==="good"?"🟢 GOOD":f.state==="limited"?"🟡 LIMITED":"🔴 POOR";
  document.getElementById("flight-title").textContent=f.state==="good"?"Weather supports bee flight":f.state==="limited"?"Flight may be reduced":"Weather is unfavorable for flight";
  document.getElementById("flight-reason").textContent="Based on "+f.reasons.join(", ")+".";
  const fc=document.getElementById("forecast"); fc.innerHTML="";
  periods.slice(0,5).forEach(p=>{
    fc.insertAdjacentHTML("beforeend",`<div class="forecast-day"><b>${p.name}</b><span class="fi">${iconFor(p.shortForecast)}</span><span class="temps">${p.temperature}°${p.temperatureUnit}</span><small>${p.shortForecast}</small></div>`);
  });
 }catch(e){
  document.getElementById("weather-status").textContent="Weather temporarily unavailable.";
  ["wx-temp","wx-feels","wx-humidity","wx-wind","wx-precip"].forEach(id=>document.getElementById(id).textContent="Unavailable");
  document.getElementById("wx-condition").textContent="Could not reach the National Weather Service";
  document.getElementById("flight-badge").className="flight-badge limited";
  document.getElementById("flight-badge").textContent="WEATHER UNAVAILABLE";
  document.getElementById("flight-title").textContent="Bee flight guide unavailable";
  document.getElementById("flight-reason").textContent="The live weather service could not be reached. The page will try again automatically.";
 }
}
loadWeather();
setInterval(loadWeather,15*60*1000);
