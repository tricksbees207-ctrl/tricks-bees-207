(() => {
  const cards = document.getElementById('forage-cards');
  const status = document.getElementById('forage-status');
  const note = document.getElementById('forage-note');
  if (!cards || !status) return;

  // Public city-center search only. This does not use or expose the apiary's precise location.
  const ELLSWORTH = { lat: 44.5434, lng: -68.4195, radiusKm: 25 };
  const DAYS_BACK = 30;
  const PLANTS_TAXON_ID = 47126;
  const FLOWERS_TERM_ID = 12;
  const FLOWERS_VALUE_ID = 13;

  const isoDate = d => d.toISOString().slice(0, 10);
  const today = new Date();
  const start = new Date(today);
  start.setDate(start.getDate() - DAYS_BACK);

  const params = new URLSearchParams({
    taxon_id: String(PLANTS_TAXON_ID),
    lat: String(ELLSWORTH.lat),
    lng: String(ELLSWORTH.lng),
    radius: String(ELLSWORTH.radiusKm),
    term_id: String(FLOWERS_TERM_ID),
    term_value_id: String(FLOWERS_VALUE_ID),
    d1: isoDate(start),
    d2: isoDate(today),
    order_by: 'observed_on',
    order: 'desc',
    per_page: '100',
    verifiable: 'true'
  });

  const apiUrl = `https://api.inaturalist.org/v1/observations?${params}`;
  const exploreUrl = `https://www.inaturalist.org/observations?${params}`;
  const sourceLink = document.querySelector('.forage-source-link');
  if (sourceLink) sourceLink.href = exploreUrl;

  function cleanName(obs) {
    const taxon = obs.taxon || {};
    return taxon.preferred_common_name || taxon.name || obs.species_guess || 'Flowering plant';
  }

  function scientificName(obs) {
    const taxon = obs.taxon || {};
    return taxon.name || '';
  }

  function formatDate(value) {
    if (!value) return 'Recent observation';
    const d = new Date(`${value}T12:00:00`);
    return Number.isNaN(d.getTime()) ? value : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  function render(items) {
    cards.innerHTML = items.map(obs => {
      const common = cleanName(obs);
      const sci = scientificName(obs);
      const date = formatDate(obs.observed_on);
      const url = obs.uri || `https://www.inaturalist.org/observations/${obs.id}`;
      return `<article class="panel forage-card live-forage-card">
        <div class="flower">🌼</div>
        <h3>${escapeHtml(common)}</h3>
        ${sci && sci.toLowerCase() !== common.toLowerCase() ? `<p class="forage-scientific"><i>${escapeHtml(sci)}</i></p>` : ''}
        <p><b>Observed flowering</b></p>
        <p class="forage-observed">Reported ${escapeHtml(date)} within ~25 km of Ellsworth.</p>
        <a class="forage-tag forage-observation-link" href="${escapeAttr(url)}" target="_blank" rel="noopener noreferrer">View observation ↗</a>
      </article>`;
    }).join('');
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>'"]/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[ch]));
  }
  function escapeAttr(value) { return escapeHtml(value); }

  fetch(apiUrl, { headers: { Accept: 'application/json' } })
    .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
    .then(data => {
      const seen = new Set();
      const unique = [];
      for (const obs of (data.results || [])) {
        const key = obs.taxon?.id || cleanName(obs).toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        unique.push(obs);
        if (unique.length === 3) break;
      }
      if (!unique.length) {
        cards.innerHTML = `<article class="panel forage-card forage-empty"><div class="flower">🌱</div><h3>No recent reports found</h3><p>No verifiable flowering observations were returned for the last ${DAYS_BACK} days within about ${ELLSWORTH.radiusKm} km of Ellsworth.</p></article>`;
        status.textContent = `No flowering observations found in the last ${DAYS_BACK} days`;
        return;
      }
      render(unique);
      status.textContent = `Live local data • ${unique.length} recent flowering species shown • checked ${today.toLocaleDateString('en-US', { month:'short', day:'numeric', year:'numeric' })}`;
    })
    .catch(() => {
      cards.innerHTML = `<article class="panel forage-card forage-empty"><div class="flower">🌿</div><h3>Local bloom feed unavailable</h3><p>The live iNaturalist feed could not be reached. Use “View nearby observations” to check the source directly.</p></article>`;
      status.textContent = 'Local flowering feed temporarily unavailable';
      note.textContent = 'Source: iNaturalist community observations. The website will try again automatically the next time the page loads.';
    });
})();
