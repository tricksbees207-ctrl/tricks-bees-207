(() => {
  const cards = document.getElementById("forage-potential-cards");
  const status = document.getElementById("forage-potential-status");
  if (!cards || !status) return;

  // Typical coastal Maine flowering months, not confirmed bloom dates.
  const forage = {
    "Acer rubrum": { months: [4, 5], value: "Pollen and nectar" },
    "Taraxacum officinale": { months: [5, 6], value: "Pollen and nectar" },
    "Malus domestica": { months: [5, 6], value: "Nectar and pollen" },
    "Trifolium repens": { months: [6, 7, 8, 9], value: "Nectar and pollen" },
    "Tilia americana": { months: [7], value: "Nectar and pollen" },
    "Chamaenerion angustifolium": { months: [7, 8], value: "Nectar and pollen" },
    "Solidago canadensis": { months: [8, 9, 10], value: "Nectar and pollen" },
    "Solidago gigantea": { months: [8, 9, 10], value: "Nectar and pollen" },
    "Solidago rugosa": { months: [8, 9, 10], value: "Nectar and pollen" },
    "Solidago sempervirens": { months: [8, 9, 10], value: "Nectar and pollen" },
    "Solidago bicolor": { months: [8, 9, 10], value: "Nectar and pollen" },
    "Symphyotrichum novae-angliae": { months: [8, 9, 10], value: "Nectar and pollen" },
    "Symphyotrichum novi-belgii": { months: [8, 9, 10], value: "Nectar and pollen" },
    "Symphyotrichum lateriflorum": { months: [8, 9, 10], value: "Nectar and pollen" },
    "Symphyotrichum puniceum": { months: [8, 9, 10], value: "Nectar and pollen" }
  };

  const today = new Date();
  const start = new Date(today);
  start.setDate(start.getDate() - 30);
  const iso = d => d.toISOString().slice(0, 10);

  const params = new URLSearchParams({
    taxon_id: "47126",
    lat: "44.5434",
    lng: "-68.4195",
    radius: "25",
    d1: iso(start),
    d2: iso(today),
    per_page: "500"
  });

  const month = today.getMonth() + 1;
  const base = "https://api.inaturalist.org/v1/observations";

  const empty = (heading, message) => {
    cards.replaceChildren();
    const article = document.createElement("article");
    article.className = "panel forage-card forage-empty";
    const title = document.createElement("h3");
    title.textContent = heading;
    const description = document.createElement("p");
    description.textContent = message;
    article.append(title, description);
    cards.append(article);
  };

  fetch(`${base}/species_counts?${params}`)
    .then(response => {
      if (!response.ok) throw new Error("iNaturalist unavailable");
      return response.json();
    })
    .then(async data => {
      const matches = (data.results || [])
        .filter(item =>
          forage[item.taxon?.name]?.months.includes(month)
        )
        .slice(0, 6);

      if (!matches.length) {
        empty("No matching sightings", "No selected seasonal forage species were reported nearby during the last 30 days.");
        status.textContent = "No matching recent plant sightings";
        return;
      }

      const observations = await Promise.all(matches.map(async item => {
        const query = new URLSearchParams(params);
        query.delete("taxon_id");
        query.delete("per_page");
        query.set("taxon_id", String(item.taxon.id));
        query.set("per_page", "1");
        query.set("order_by", "observed_on");
        query.set("order", "desc");
        try {
          const response = await fetch(`${base}?${query}`);
          if (!response.ok) return null;
          const data = await response.json();
          return data.results?.[0] || null;
        } catch {
          return null;
        }
      }));

      cards.replaceChildren();
      let shown = 0;

      matches.forEach((item, index) => {
        const observation = observations[index];
        if (!observation?.id) return;

        const article = document.createElement("article");
        article.className = "panel forage-card";

        const flower = document.createElement("div");
        flower.className = "flower";
        flower.textContent = "🌿";

        const title = document.createElement("h3");
        title.textContent = item.taxon.preferred_common_name || item.taxon.name;

        const scientific = document.createElement("p");
        scientific.className = "forage-scientific";
        scientific.textContent = item.taxon.name;

        const count = document.createElement("p");
        count.textContent = `${item.count} recent observation(s) nearby`;

        const value = document.createElement("p");
        value.textContent = `Potential bee forage: ${forage[item.taxon.name].value}`;

        const warning = document.createElement("p");
        warning.textContent = "Flowering not confirmed";

        const link = document.createElement("a");
        link.className = "forage-tag forage-observation-link";
        link.textContent = "View observation ↗";
        link.href = `https://www.inaturalist.org/observations/${observation.id}`;
        link.target = "_blank";
        link.rel = "noopener noreferrer";

        article.append(flower, title, scientific, count, value, warning, link);
        cards.append(article);
        shown++;
      });

      if (!shown) {
        empty("Sightings unavailable", "Recent observation details could not be retrieved.");
      }
      status.textContent = `${shown} potential forage species shown • Last 30 days • Flowering unconfirmed`;
    })
    .catch(() => {
      empty("Plant sightings unavailable", "The iNaturalist feed could not be reached.");
      status.textContent = "Local plant sightings temporarily unavailable";
    });
})();
