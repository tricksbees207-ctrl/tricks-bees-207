(() => {
  const cards = document.getElementById("forage-season-cards");
  const title = document.getElementById("forage-season-title");
  if (!cards || !title) return;

  const plants = [
    { name: "Willow", months: [4, 5], bloom: "April–May", value: "Pollen and some nectar", note: "An early-season resource when weather permits bee flight." },
    { name: "Red maple", months: [4, 5], bloom: "April–May", value: "Pollen and nectar", note: "An important early spring resource." },
    { name: "Dandelion", months: [5, 6], bloom: "May–June", value: "Pollen and nectar", note: "A supplementary spring forage source." },
    { name: "Apple blossoms", months: [5, 6], bloom: "May–June", value: "Nectar and pollen", note: "Useful spring forage where apple trees are present." },
    { name: "White clover", months: [6, 7, 8, 9], bloom: "June–September", value: "Nectar and pollen", note: "A valuable summer nectar source in suitable conditions." },
    { name: "Basswood", months: [7], bloom: "July", value: "Nectar and pollen", note: "Can produce a strong but brief nectar flow where trees occur." },
    { name: "Fireweed", months: [7, 8], bloom: "July–August", value: "Nectar and pollen", note: "Useful summer forage in suitable open habitats." },
    { name: "Goldenrod", months: [8, 9, 10], bloom: "August–October", value: "Nectar and pollen", note: "An important late-season resource; flowering often ends before late October." },
    { name: "New England aster", months: [8, 9, 10], bloom: "August–October", value: "Nectar and pollen", note: "Late-season forage that can continue until frost." }
  ];

  const now = new Date();
  const month = now.getMonth() + 1;
  const monthName = now.toLocaleDateString("en-US", { month: "long" });

  title.textContent = `${monthName} honey bee forage in coastal Maine`;

  const seasonal = plants.filter(plant => plant.months.includes(month));

  if (!seasonal.length) {
    cards.innerHTML = `
      <article class="panel forage-card forage-empty">
        <div class="flower">🍂</div>
        <h3>Little dependable outdoor forage expected</h3>
        <p>Most typical nectar and pollen sources are outside their flowering season. Mild weather can occasionally produce exceptions.</p>
      </article>`;
    return;
  }

  cards.innerHTML = seasonal.map(plant => `
    <article class="panel forage-card">
      <div class="flower">🌼</div>
      <h3>${plant.name}</h3>
      <p><b>Typical bloom:</b> ${plant.bloom}</p>
      <p><b>Bee forage:</b> ${plant.value}</p>
      <p>${plant.note}</p>
      <span class="forage-tag">Seasonal guide, not a live report</span>
    </article>
  `).join("");
})();
