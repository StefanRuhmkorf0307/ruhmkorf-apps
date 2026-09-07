/* DoughCalculator - Rechenlogik, I18N und UI-Rendering.

   Bewusst aus site/doughcalculator/index.html ausgelagert: Die Logik soll
   genau einmal existieren, damit die geplante zweite (englische)
   Sprachversion sie mitbenutzen kann, statt sie zu duplizieren. Zusaetzlich
   kann der Browser die Datei zwischen Seitenaufrufen cachen.

   Erwartet das Markup aus index.html (#ingredients-body, #scale-list,
   #stat-*, .lang-toggle, .actions-row-Buttons) und laeuft ohne weitere
   Abhaengigkeiten. */

(function () {
  "use strict";

  var BAKE_LOSS = 0.15; // fixed 15%, matches the iOS app model

  var CATEGORY_DEFAULTS = {
    flour:    { flour: 100, water: 0 },
    water:    { flour: 0,   water: 100 },
    liquid:   { flour: 0,   water: 100 }, // other liquids (milk, broth, ...) - simplified as 100% water-equivalent
    starter:  { flour: 50,  water: 50 },  // assumes 100% hydration starter by default
    salt:     { flour: 0,   water: 0 },
    other:    { flour: 0,   water: 0 }
  };

  // These categories don't get a description field at all - their name is
  // implied by the category itself (Mehl/Wasser/Salz), so there's nothing
  // meaningful to type in.
  var NO_DESCRIPTION_CATEGORIES = ["water", "flour", "salt"];
  function hasNoDescription(category) { return NO_DESCRIPTION_CATEGORIES.indexOf(category) !== -1; }

  var CATEGORY_LABELS = {
    de: { flour: "Mehl", water: "Wasser", liquid: "Sonstiges flüssig", starter: "Anstellgut", salt: "Salz", other: "Sonstiges fest" },
    en: { flour: "Flour", water: "Water", liquid: "Other (liquid)", starter: "Starter", salt: "Salt", other: "Other (solid)" }
  };

  // Category dropdown options are shown alphabetically by their translated
  // label (not in the fixed flour/water/starter/... order the object above
  // is defined in), so the sort order also flips correctly between DE/EN.
  function sortedCategoryKeys(lang) {
    var labels = CATEGORY_LABELS[lang];
    return Object.keys(labels).sort(function (a, b) {
      return labels[a].localeCompare(labels[b], lang);
    });
  }

  // Starter/Anstellgut suggestions describe a flour:water ratio (by weight).
  // Picking one doesn't just fill the text field - it also sets that row's
  // flourPct/waterPct to match (see nameInput's "input" handler below), so
  // the hydration/baker's-% math reflects the chosen ratio instead of
  // always assuming a 1:1 (100% hydration) starter.
  var STARTER_RATIOS = [
    { flourParts: 2, waterParts: 1 },
    { flourParts: 3, waterParts: 2 },
    { flourParts: 5, waterParts: 4 },
    { flourParts: 1, waterParts: 1 },
    { flourParts: 4, waterParts: 5 }
  ];
  STARTER_RATIOS.forEach(function (r) {
    r.hydration = r.waterParts / r.flourParts * 100;
    r.de = r.flourParts + ":" + r.waterParts + " Mehl:Wasser";
    r.en = r.flourParts + ":" + r.waterParts + " flour:water";
  });

  function starterRatioPercents(hydration) {
    var flour = 100 / (100 + hydration) * 100;
    var water = hydration / (100 + hydration) * 100;
    return { flour: flour, water: water };
  }

  // Look up a starter suggestion by its exact displayed label (current
  // language), so selecting one from the datalist can set flourPct/waterPct.
  function findStarterRatioByLabel(label) {
    for (var i = 0; i < STARTER_RATIOS.length; i++) {
      if (STARTER_RATIOS[i][state.lang] === label) return STARTER_RATIOS[i];
    }
    return null;
  }

  // Suggestions shown in the free-text description field, filtered to the
  // ingredient's currently selected category. Still a free-text input -
  // these are offered via <datalist>, not enforced. Water has none: there's
  // nothing to disambiguate, plain "Wasser"/"Water" is already the value.
  var NAME_SUGGESTIONS = {
    de: {
      flour: ["Weizenmehl Type 405", "Weizenmehl Type 550", "Weizenmehl Type 812", "Weizenmehl Type 1050", "Roggenmehl Type 997", "Roggenmehl Type 1150", "Dinkelmehl Type 630", "Dinkelmehl Type 1050", "Vollkornmehl (Weizen)", "Vollkornmehl (Roggen)", "Emmermehl", "Einkornmehl"],
      water: [],
      liquid: ["Milch", "Buttermilch", "Joghurt", "Kefir", "Sahne", "Gemüsebrühe", "Bier", "Öl", "Honig (flüssig)", "Molke"],
      starter: STARTER_RATIOS.map(function (r) { return r.de; }),
      salt: ["Salz", "Meersalz", "Jodsalz"],
      other: ["Brauner Zucker", "Weißer Zucker", "Honig (fest/kristallisiert)", "Butter", "Sonnenblumenkerne", "Leinsamen", "Walnüsse", "Trockenhefe", "Frischhefe", "Gewürze"]
    },
    en: {
      flour: ["Bread flour (Type 550)", "All-purpose flour (Type 405)", "Whole wheat flour", "Rye flour", "Spelt flour", "Einkorn flour", "Emmer flour"],
      water: [],
      liquid: ["Milk", "Buttermilk", "Yogurt", "Kefir", "Cream", "Vegetable broth", "Beer", "Oil", "Honey (liquid)", "Whey"],
      starter: STARTER_RATIOS.map(function (r) { return r.en; }),
      salt: ["Salt", "Sea salt", "Iodized salt"],
      other: ["Brown sugar", "White sugar", "Honey (solid/crystallized)", "Butter", "Sunflower seeds", "Flax seeds", "Walnuts", "Dry yeast", "Fresh yeast", "Spices"]
    }
  };

  var I18N = {
    de: {
      ingredientsHeading: "Zutaten",
      colName: "Zusatzinfo", colCategory: "Zutat", colAmount: "Menge (g)", colBaker: "Bäcker-%",
      addIngredient: "+ Zutat hinzufügen",
      loadExample: "Beispielrezept laden",
      clearAll: "Alles löschen",
      summaryHeading: "Übersicht",
      statDough: "Gesamtteiggewicht", statFlour: "Gesamtmehlgewicht", statWater: "Gesamtwassergewicht",
      statHydration: "Hydration", statBreadWeight: "Erwartetes Brotgewicht",
      statDoughExplain: "Summe der Mengen aller Zutaten.",
      statFlourExplain: "Summe aus Menge × Mehlanteil über alle Zutaten. Mehl zählt zu 100%, Anstellgut anteilig nach dem gewählten Mehl:Wasser-Verhältnis; Sonstiges flüssig und Sonstiges fest zählen nicht zum Mehlanteil.",
      statWaterExplain: "Summe aus Menge × Wasseranteil über alle Zutaten. Wasser und Sonstiges flüssig zählen zu 100%, Anstellgut anteilig nach dem gewählten Mehl:Wasser-Verhältnis; Sonstiges fest zählt nicht zum Wasseranteil.",
      statHydrationExplain: "Gesamtwassergewicht geteilt durch Gesamtmehlgewicht, × 100.",
      statBreadWeightExplain: "Gesamtteiggewicht abzüglich 15% Backverlust beim Backen.",
      scaleHeading: "Rezept skalieren",
      scaleNote: "Passe Teiggewicht, Brotgewicht oder eine einzelne Zutat an – der Rest wird proportional mitskaliert, die Bäckerprozente bleiben dabei unverändert.",
      scaleRowDough: "Teiggewicht",
      scaleRowBread: "Brotgewicht",
      impressumHeading: "Impressum",
      impressumContact: "Kontakt",
      removeIngredient: "Zutat entfernen",
      errNoFlour: "Bitte mindestens eine Zutat mit Mehlanteil > 0 eingeben, um Hydration/Bäckerprozente zu berechnen.",
      confirmClear: "Wirklich alle Zutaten löschen?"
    },
    en: {
      ingredientsHeading: "Ingredients",
      colName: "Additional info", colCategory: "Ingredient", colAmount: "Amount (g)", colBaker: "Baker's %",
      addIngredient: "+ Add ingredient",
      loadExample: "Load example recipe",
      clearAll: "Clear all",
      summaryHeading: "Overview",
      statDough: "Total dough weight", statFlour: "Total flour weight", statWater: "Total water weight",
      statHydration: "Hydration", statBreadWeight: "Expected bread weight",
      statDoughExplain: "Sum of the amounts of all ingredients.",
      statFlourExplain: "Sum of amount × flour share across all ingredients. Flour counts as 100%, starter counts proportionally per its chosen flour:water ratio; other (liquid) and other (solid) don't count toward the flour share.",
      statWaterExplain: "Sum of amount × water share across all ingredients. Water and other (liquid) count as 100%, starter counts proportionally per its chosen flour:water ratio; other (solid) doesn't count toward the water share.",
      statHydrationExplain: "Total water weight divided by total flour weight, × 100.",
      statBreadWeightExplain: "Total dough weight minus a flat 15% baking loss.",
      scaleHeading: "Scale recipe",
      scaleNote: "Adjust dough weight, bread weight, or a single ingredient - everything else scales along with it, and baker's percentages stay the same.",
      scaleRowDough: "Dough weight",
      scaleRowBread: "Bread weight",
      impressumHeading: "Legal notice",
      impressumContact: "Contact",
      removeIngredient: "Remove ingredient",
      errNoFlour: "Please enter at least one ingredient with flour % > 0 to calculate hydration/baker's percentages.",
      confirmClear: "Really clear all ingredients?"
    }
  };

  var STORAGE_KEY = "doughcalculator.recipe.v7"; // bumped: example recipe now has Zucker (45g) instead of the empty "Sonstiges flüssig"/"Sonstiges fest" placeholders
  var LANG_KEY = "doughcalculator.lang";

  // name is per-language where the example has actual text (the starter
  // ratio label and "Zucker"/"Sugar") - resolved to a plain string by
  // cloneExample() below, based on the language active at the time.
  var EXAMPLE_RECIPE = [
    { name: "", category: "flour",   amount: 750, flourPct: 100, waterPct: 0 },
    { name: "", category: "water", amount: 450, flourPct: 0, waterPct: 100 },
    { name: { de: "1:1 Mehl:Wasser", en: "1:1 flour:water" }, category: "starter", amount: 225, flourPct: 50, waterPct: 50 },
    { name: "", category: "salt", amount: 21, flourPct: 0, waterPct: 0 },
    { name: { de: "Zucker", en: "Sugar" }, category: "other", amount: 45, flourPct: 0, waterPct: 0 }
  ];

  var state = {
    lang: localStorage.getItem(LANG_KEY) || "de",
    ingredients: loadRecipe()
  };

  var nextId = 1;
  state.ingredients.forEach(function (ing) { ing._id = nextId++; });

  function loadRecipe() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return cloneExample();
      var parsed = JSON.parse(raw);
      if (!Array.isArray(parsed) || parsed.length === 0) return cloneExample();
      return parsed;
    } catch (e) {
      return cloneExample();
    }
  }

  function cloneExample() {
    // state isn't assigned yet the first time this runs (it's called while
    // building the state object literal itself), so fall back to reading
    // the language straight from localStorage, same as state.lang does.
    var lang = (typeof state !== "undefined" && state && state.lang) || localStorage.getItem(LANG_KEY) || "de";
    return EXAMPLE_RECIPE.map(function (i) {
      var copy = Object.assign({}, i);
      if (copy.name && typeof copy.name === "object") {
        copy.name = copy.name[lang] || copy.name.de || "";
      }
      return copy;
    });
  }

  function saveRecipe() {
    try {
      var toSave = state.ingredients.map(function (i) {
        return { name: i.name, category: i.category, amount: i.amount, flourPct: i.flourPct, waterPct: i.waterPct };
      });
      localStorage.setItem(STORAGE_KEY, JSON.stringify(toSave));
    } catch (e) {
      /* localStorage may be unavailable (private mode, quota); fail silently */
    }
  }

  function t(key) { return I18N[state.lang][key]; }

  function applyI18n() {
    document.documentElement.lang = state.lang;
    document.querySelectorAll("[data-i18n]").forEach(function (el) {
      var key = el.getAttribute("data-i18n");
      if (I18N[state.lang][key] !== undefined) el.textContent = I18N[state.lang][key];
    });
    document.querySelectorAll(".lang-toggle button").forEach(function (btn) {
      btn.classList.toggle("active", btn.getAttribute("data-lang") === state.lang);
    });
    renderCategoryOptions();
    render();
  }

  function fmt(n, decimals) {
    if (n === null || n === undefined || isNaN(n)) return "–";
    var locale = state.lang === "de" ? "de-DE" : "en-US";
    return n.toLocaleString(locale, { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  }

  function computeTotals() {
    var totalDough = 0, totalFlour = 0, totalWater = 0;
    state.ingredients.forEach(function (i) {
      var amount = Number(i.amount) || 0;
      totalDough += amount;
      totalFlour += amount * (Number(i.flourPct) || 0) / 100;
      totalWater += amount * (Number(i.waterPct) || 0) / 100;
    });
    var hydration = totalFlour > 0 ? (totalWater / totalFlour) * 100 : null;
    var breadWeight = totalDough * (1 - BAKE_LOSS);
    return { totalDough: totalDough, totalFlour: totalFlour, totalWater: totalWater, hydration: hydration, breadWeight: breadWeight };
  }

  function bakerPercent(ing, totals) {
    if (!totals.totalFlour || totals.totalFlour <= 0) return null;
    return (Number(ing.amount) || 0) / totals.totalFlour * 100;
  }

  function renderCategoryOptions() {
    // handled inline per-row in renderRow via <select>, nothing global needed here besides
    // making sure existing selects re-render with translated labels:
    document.querySelectorAll("select.cat-select").forEach(function (sel) {
      var current = sel.value;
      sel.innerHTML = "";
      sortedCategoryKeys(state.lang).forEach(function (key) {
        var opt = document.createElement("option");
        opt.value = key;
        opt.textContent = CATEGORY_LABELS[state.lang][key];
        sel.appendChild(opt);
      });
      sel.value = current;
    });
  }

  // Shared by the description field's "input" event and by clicking a
  // suggestion, so both paths behave identically.
  function applyNameChange(ing, nameInput) {
    ing.name = nameInput.value;

    // For starter/Anstellgut, picking one of the flour:water ratio
    // suggestions also sets that row's flourPct/waterPct so the
    // hydration/baker's-% math actually reflects the chosen ratio -
    // otherwise the number in the name would be purely cosmetic.
    if (ing.category === "starter") {
      var ratio = findStarterRatioByLabel(nameInput.value);
      if (ratio) {
        var pct = starterRatioPercents(ratio.hydration);
        ing.flourPct = pct.flour;
        ing.waterPct = pct.water;
      }
    }

    scheduleSave();
    renderSummaryAndBakerPercents();
  }

  function renderRow(ing, totals) {
    var tr = document.createElement("tr");
    tr.dataset.id = ing._id;

    var tdCat = document.createElement("td");
    tdCat.className = "col-category";
    tdCat.dataset.label = t("colCategory");
    var catSelect = document.createElement("select");
    catSelect.className = "cat-select";
    sortedCategoryKeys(state.lang).forEach(function (key) {
      var opt = document.createElement("option");
      opt.value = key;
      opt.textContent = CATEGORY_LABELS[state.lang][key];
      catSelect.appendChild(opt);
    });
    catSelect.value = ing.category;
    catSelect.addEventListener("change", function () {
      ing.category = catSelect.value;
      var defaults = CATEGORY_DEFAULTS[ing.category] || { flour: 0, water: 0 };
      ing.flourPct = defaults.flour;
      ing.waterPct = defaults.water;
      // These categories have no description field of their own - drop any
      // leftover text from a previous category.
      if (hasNoDescription(ing.category)) ing.name = "";
      scheduleSave();
      render();
    });
    tdCat.appendChild(catSelect);

    var tdName = document.createElement("td");
    tdName.className = "col-name";
    tdName.dataset.label = t("colName");

    // Mehl, Wasser and Salz have no meaningful description of their own,
    // so they get no input field at all - just an empty cell.
    if (!hasNoDescription(ing.category)) {
      var nameWrap = document.createElement("div");
      nameWrap.className = "name-field-wrap";

      var nameInput = document.createElement("input");
      nameInput.type = "text";
      nameInput.autocomplete = "off";
      nameInput.value = ing.name;
      nameInput.addEventListener("input", function () { applyNameChange(ing, nameInput); });
      nameWrap.appendChild(nameInput);

      // Custom suggestion dropdown (not a native <datalist>) filtered only by
      // the currently selected category - never by what's already typed, so
      // the full list stays available even once there's text in the field.
      var suggestions = (NAME_SUGGESTIONS[state.lang] && NAME_SUGGESTIONS[state.lang][ing.category]) || [];
      if (suggestions.length > 0) {
        var suggestList = document.createElement("div");
        suggestList.className = "name-suggest-list";
        suggestList.hidden = true;
        suggestions.forEach(function (s) {
          var btn = document.createElement("button");
          btn.type = "button";
          btn.textContent = s;
          // mousedown (fired, and prevented, before the input would blur) lets
          // us fill the value without the browser yanking focus away first.
          btn.addEventListener("mousedown", function (e) {
            e.preventDefault();
            nameInput.value = s;
            applyNameChange(ing, nameInput);
            suggestList.hidden = true;
            nameInput.focus();
          });
          suggestList.appendChild(btn);
        });
        nameInput.addEventListener("focus", function () { suggestList.hidden = false; });
        nameInput.addEventListener("click", function () { suggestList.hidden = false; });
        nameInput.addEventListener("blur", function () {
          // Small delay so a click on a suggestion (mousedown -> click) can
          // still land before the list disappears.
          setTimeout(function () { suggestList.hidden = true; }, 150);
        });
        nameWrap.appendChild(suggestList);
      }

      tdName.appendChild(nameWrap);
    }

    var tdAmount = document.createElement("td");
    tdAmount.className = "col-amount";
    tdAmount.dataset.label = t("colAmount");
    var amountInput = document.createElement("input");
    amountInput.type = "number";
    amountInput.min = "0";
    // The spinner/keyboard step (and the displayed precision) adapt to the
    // current amount's magnitude, same as the "Rezept skalieren" steppers:
    // fine 0.1g nudges under 10g, whole grams from 10g up. This only ever
    // formats amountInput's own text/step - it must NEVER write back into
    // ing.amount, because renderRow() (and so this whole function) reruns on
    // every render(), including after every proportional rescale; rounding
    // the stored amount here on every render used to quietly re-introduce
    // exactly the drift/zero-rounding that scaling must not cause.
    function refreshAmountDisplay() {
      var steps = stepSizesForValue(ing.amount);
      amountInput.step = steps.small < 1 ? "0.1" : String(steps.small);
      amountInput.value = steps.small < 1
        ? (Number(ing.amount) || 0).toFixed(1)
        : Math.round(Number(ing.amount) || 0);
      return steps;
    }
    refreshAmountDisplay();
    amountInput.addEventListener("input", function () {
      ing.amount = amountInput.value === "" ? 0 : parseFloat(amountInput.value);
      // Only update the step attribute here, not the displayed text -
      // reformatting mid-keystroke (e.g. appending ".0") would fight with
      // typing.
      var steps = stepSizesForValue(ing.amount);
      amountInput.step = steps.small < 1 ? "0.1" : String(steps.small);
      scheduleSave();
      renderSummaryAndBakerPercents();
    });
    amountInput.addEventListener("blur", function () {
      // NOW it's fine to snap the just-typed value to the display precision -
      // this only happens once, right after the person finished editing this
      // exact field by hand, not as a side effect of scaling elsewhere.
      var steps = stepSizesForValue(ing.amount);
      ing.amount = steps.small < 1
        ? Math.round((Number(ing.amount) || 0) * 10) / 10
        : Math.round(Number(ing.amount) || 0);
      refreshAmountDisplay();
      scheduleSave();
      renderSummaryAndBakerPercents();
    });
    tdAmount.appendChild(amountInput);

    var tdBaker = document.createElement("td");
    tdBaker.className = "col-baker baker-cell";
    tdBaker.dataset.label = t("colBaker");
    var bp = bakerPercent(ing, totals);
    tdBaker.textContent = bp === null ? "–" : fmt(bp, 1) + "%";

    var tdRemove = document.createElement("td");
    tdRemove.className = "col-remove";
    var removeBtn = document.createElement("button");
    removeBtn.type = "button";
    removeBtn.className = "icon-btn";
    removeBtn.title = t("removeIngredient");
    removeBtn.textContent = "✕";
    removeBtn.addEventListener("click", function () {
      state.ingredients = state.ingredients.filter(function (i) { return i._id !== ing._id; });
      scheduleSave();
      render();
    });
    tdRemove.appendChild(removeBtn);

    tr.appendChild(tdCat);
    tr.appendChild(tdName);
    tr.appendChild(tdAmount);
    tr.appendChild(tdBaker);
    tr.appendChild(tdRemove);
    return tr;
  }

  function renderSummaryAndBakerPercents() {
    var totals = computeTotals();
    document.getElementById("stat-dough").textContent = fmt(totals.totalDough, 0) + " g";
    document.getElementById("stat-flour").textContent = fmt(totals.totalFlour, 0) + " g";
    document.getElementById("stat-water").textContent = fmt(totals.totalWater, 0) + " g";
    document.getElementById("stat-hydration").textContent = totals.hydration === null ? t("errNoFlour") : fmt(totals.hydration, 1) + " %";
    document.getElementById("stat-hydration").style.fontSize = totals.hydration === null ? "0.8rem" : "";
    document.getElementById("stat-bread").textContent = fmt(totals.breadWeight, 0) + " g";

    document.querySelectorAll("#ingredients-body tr").forEach(function (tr) {
      if (tr.classList.contains("hint-row")) return;
      var id = Number(tr.dataset.id);
      var ing = state.ingredients.find(function (i) { return i._id === id; });
      if (!ing) return;
      var cell = tr.querySelector(".baker-cell");
      var bp = bakerPercent(ing, totals);
      cell.textContent = bp === null ? "–" : fmt(bp, 1) + "%";
    });

    renderScaleList();
    return totals;
  }

  // Applies a new target value for the dough total, the bread weight, or a
  // single ingredient's amount: computes the scaling factor from the change
  // and applies it to every ingredient, exactly like the old three-mode
  // scaler did - just triggered directly from the list's own controls now.
  // A currently-zero ingredient (e.g. an empty "Sonstiges" placeholder) has
  // no valid ratio to scale from, so adjusting it just sets its own amount.
  function rescaleTo(refType, refId, newValue) {
    if (!(newValue > 0)) return;
    var totals = computeTotals();

    if (refType === "ingredient") {
      var refIng = state.ingredients.find(function (i) { return i._id === refId; });
      if (!refIng) return;
      if (!(Number(refIng.amount) > 0)) {
        // Stored as-is, unrounded - see the note below on why the internal
        // value is never rounded.
        refIng.amount = newValue;
        scheduleSave();
        render();
        return;
      }
    }

    if (!(totals.totalDough > 0)) return;

    var factor = null;
    if (refType === "dough") {
      factor = newValue / totals.totalDough;
    } else if (refType === "bread") {
      var targetDough = newValue / (1 - BAKE_LOSS);
      factor = targetDough / totals.totalDough;
    } else if (refType === "ingredient") {
      factor = newValue / Number(refIng.amount);
    }
    if (factor === null || !isFinite(factor) || factor <= 0) return;

    // The internal amount is deliberately kept at full (unrounded) floating-
    // point precision here - only the display layer (renderRow/renderScaleList,
    // via stepSizesForValue) rounds for showing a value. Rounding every
    // ingredient to 0.1g on every single scale step is what previously (a)
    // very slightly shifted baker's percentages away from their exact ratio
    // with each rescale, and (b) could round a small ingredient down to
    // exactly 0, which both breaks its own percentage and, if it happened to
    // a flour-category ingredient, made totalFlour 0 and broke every
    // percentage in the recipe. Multiplying an exact positive amount by an
    // exact positive factor is always positive and always keeps
    // amount/totalFlour exactly the same ratio it was before scaling, so
    // neither problem can occur anymore.
    state.ingredients.forEach(function (ing) {
      ing.amount = (Number(ing.amount) || 0) * factor;
    });
    scheduleSave();
    render();
  }

  // Step sizes scale with the current value, so a near-zero amount can still
  // be nudged by 0.1g while a >=1000g dough/bread total moves in fast 100g
  // (and 50g) jumps instead of forever clicking +1.
  function stepSizesForValue(value) {
    var v = Math.abs(Number(value) || 0);
    if (v < 10) return { small: 0.1, big: 1 };
    if (v < 100) return { small: 1, big: 10 };
    if (v < 1000) return { small: 10, big: 50 };
    return { small: 50, big: 100 };
  }
  // Chevrons instead of the raw step numbers on the buttons themselves - the
  // magnitude (big vs small) is conveyed by double vs single chevron, the
  // direction by which way they point. title/aria-label keep the exact
  // numeric step available to screen readers and as a hover tooltip.
  function formatStepLabel(delta) {
    var abs = Math.abs(delta);
    var num = abs < 1 ? abs.toFixed(1) : String(abs);
    return (delta > 0 ? "+" : "-") + num + " g";
  }

  // Shared row builder for both the Teiggewicht/Brotgewicht mini-table (in
  // the Zutaten card) and the per-ingredient list (in Rezept skalieren) -
  // same stepper row, just appended into whichever container is passed in.
  function addScaleHeaderRow(container) {
    var row = document.createElement("div");
    row.className = "scale-row scale-row-header";

    var labelEl = document.createElement("div");
    labelEl.className = "scale-row-label";
    labelEl.textContent = t("colCategory");
    row.appendChild(labelEl);

    var valueEl = document.createElement("div");
    valueEl.className = "scale-row-controls scale-row-header-value";
    valueEl.textContent = t("colAmount");
    row.appendChild(valueEl);

    container.appendChild(row);
  }

  function addScaleRow(container, labelText, value, onApply, extraClass) {
    var row = document.createElement("div");
    row.className = "scale-row";
    if (extraClass) row.classList.add(extraClass);

    var labelEl = document.createElement("div");
    labelEl.className = "scale-row-label";
    labelEl.textContent = labelText;
    row.appendChild(labelEl);

    var controls = document.createElement("div");
    controls.className = "scale-row-controls";

    var steps = stepSizesForValue(value);
    var fine = steps.small < 1;

    // Value field first, then all four step buttons together right behind
    // it (not flanking it on both sides).
    var valueInput = document.createElement("input");
    valueInput.type = "number";
    valueInput.className = "scale-value-input";
    valueInput.min = "0";
    valueInput.step = fine ? "0.1" : String(steps.small);
    valueInput.value = fine ? value.toFixed(1) : Math.round(value);
    valueInput.addEventListener("change", function () {
      var v = parseFloat(valueInput.value);
      if (isFinite(v) && v > 0) {
        onApply(v);
      } else {
        valueInput.value = fine ? value.toFixed(1) : Math.round(value);
      }
    });
    controls.appendChild(valueInput);

    [
      { delta: -steps.big, icon: "«", big: true },
      { delta: -steps.small, icon: "‹", big: false },
      { delta: steps.small, icon: "›", big: false },
      { delta: steps.big, icon: "»", big: true }
    ].forEach(function (stepDef) {
      var btn = document.createElement("button");
      btn.type = "button";
      // The big (« »)  step buttons are hidden on narrow screens (see the
      // max-width:560px rule) so the row keeps the same single-line layout
      // as the wide view instead of wrapping/stacking.
      btn.className = "scale-step-btn" + (stepDef.big ? " scale-step-btn-big" : "");
      btn.textContent = stepDef.icon;
      var deltaLabel = formatStepLabel(stepDef.delta);
      btn.title = deltaLabel;
      btn.setAttribute("aria-label", deltaLabel);
      btn.addEventListener("click", function () {
        onApply(Math.max(Math.round((value + stepDef.delta) * 10) / 10, 0.1));
      });
      controls.appendChild(btn);
    });

    row.appendChild(controls);
    container.appendChild(row);
  }

  function renderScaleList() {
    var container = document.getElementById("scale-list");
    if (!container) return;
    container.innerHTML = "";
    var totals = computeTotals();

    addScaleHeaderRow(container);
    var shownCount = 0;
    state.ingredients.forEach(function (ing) {
      // Ingredients at 0% baker's percentage (i.e. currently 0g) have
      // nothing to scale yet - they clutter the list without being
      // adjustable in a meaningful way, so they're left out here. They
      // still show up (and can be given an amount) in the Zutaten table
      // above; once that's non-zero they'll appear here too.
      var bp = bakerPercent(ing, totals);
      if (bp === 0) return;

      var catLabel = (CATEGORY_LABELS[state.lang] && CATEGORY_LABELS[state.lang][ing.category]) || "";
      var label;
      if (hasNoDescription(ing.category)) {
        // No description to show for these - just the category name, no
        // redundant "Mehl · Mehl" style duplicate.
        label = catLabel || t("colName");
      } else {
        var desc = ing.name || ("(" + t("colName") + ")");
        label = catLabel ? (catLabel + " · " + desc) : desc;
      }
      addScaleRow(container, label, Number(ing.amount) || 0, function (newVal) { rescaleTo("ingredient", ing._id, newVal); });
      shownCount++;
    });

    // Teiggewicht/Brotgewicht sit at the end of the list now, right after
    // the individual ingredients. The divider only makes sense if there was
    // at least one ingredient row above them to separate from.
    addScaleRow(container, t("scaleRowDough"), totals.totalDough, function (newVal) { rescaleTo("dough", null, newVal); }, shownCount > 0 ? "scale-row-divider-top" : null);
    addScaleRow(container, t("scaleRowBread"), totals.breadWeight, function (newVal) { rescaleTo("bread", null, newVal); });
  }

  function render() {
    var totals = computeTotals();
    var tbody = document.getElementById("ingredients-body");
    tbody.innerHTML = "";
    state.ingredients.forEach(function (ing) {
      tbody.appendChild(renderRow(ing, totals));
    });
    renderSummaryAndBakerPercents();
  }

  var saveTimer = null;
  function scheduleSave() {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(saveRecipe, 400);
  }

  document.getElementById("add-ingredient").addEventListener("click", function () {
    state.ingredients.push({ _id: nextId++, name: "", category: "other", amount: 0, flourPct: 0, waterPct: 0 });
    scheduleSave();
    render();
  });

  document.getElementById("reset-example").addEventListener("click", function () {
    state.ingredients = cloneExample();
    state.ingredients.forEach(function (ing) { ing._id = nextId++; });
    scheduleSave();
    render();
  });

  document.getElementById("clear-all").addEventListener("click", function () {
    if (!window.confirm(t("confirmClear"))) return;
    state.ingredients = [];
    scheduleSave();
    render();
  });

  document.querySelectorAll(".lang-toggle button").forEach(function (btn) {
    btn.addEventListener("click", function () {
      state.lang = btn.getAttribute("data-lang");
      localStorage.setItem(LANG_KEY, state.lang);
      applyI18n();
    });
  });

  // Flush any pending debounced save immediately when the tab is hidden or
  // closed, so a quick navigation away never loses the last edit
  // (same principle as the iOS app: debounce normally, save instantly on
  // background/exit).
  function flushSave() {
    if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
    saveRecipe();
  }
  document.addEventListener("visibilitychange", function () {
    if (document.hidden) flushSave();
  });
  window.addEventListener("pagehide", flushSave);

  // Close any open description-suggestion dropdown when clicking elsewhere,
  // or on Escape (the input's own "blur" handler covers tabbing away).
  document.addEventListener("click", function (e) {
    document.querySelectorAll(".name-suggest-list:not([hidden])").forEach(function (list) {
      if (!list.parentElement.contains(e.target)) list.hidden = true;
    });
  });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") {
      document.querySelectorAll(".name-suggest-list:not([hidden])").forEach(function (list) { list.hidden = true; });
    }
  });

  applyI18n();
})();
