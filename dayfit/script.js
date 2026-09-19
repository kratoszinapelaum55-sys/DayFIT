/* =========================================================
   DayFIT — script.js
   Front-end conectado à API real (Node/Express + Postgres).
   Requer api.js carregado antes deste arquivo.
   ========================================================= */

(function () {
  "use strict";

  const api = DayFitAPI;

  /* ---------------------------------------------------------
     STATIC LABELS (ícones/nomes fixos; dados reais vêm da API)
  --------------------------------------------------------- */
  const FOOD_CATS = [
    { id: 'todos', name: 'Todos', ico: '🍽️' },
    { id: 'proteinas', name: 'Proteínas', ico: '🥩' },
    { id: 'carboidratos', name: 'Carboidratos', ico: '🍚' },
    { id: 'gorduras', name: 'Gorduras', ico: '🥑' },
    { id: 'frutas', name: 'Frutas', ico: '🍎' },
    { id: 'vegetais', name: 'Vegetais', ico: '🥦' },
    { id: 'laticinios', name: 'Laticínios', ico: '🥛' },
    { id: 'oleaginosas', name: 'Oleaginosas', ico: '🥜' },
    { id: 'bebidas', name: 'Bebidas', ico: '🥤' },
  ];

  const RECIPE_CATS = [
    { id: 'todos', name: 'Todos' },
    { id: 'shakes', name: 'Shakes' },
    { id: 'cafe', name: 'Café da manhã' },
    { id: 'almoco', name: 'Almoço' },
    { id: 'lanches', name: 'Lanches' },
    { id: 'jantar', name: 'Jantar' },
    { id: 'sobremesas', name: 'Sobremesas' },
  ];

  const OBJECTIVES = [
    { id: 'massa', ico: '🏋️', name: 'Ganhar massa' },
    { id: 'reduzir', ico: '🔥', name: 'Reduzir gordura' },
    { id: 'manter', ico: '⚖️', name: 'Manter peso' },
  ];

  const MEAL_LABELS = { cafe: 'Café da manhã', almoco: 'Almoço', lanche: 'Lanche', jantar: 'Jantar' };

  /* ---------------------------------------------------------
     CACHE — espelha os dados vindos da API
  --------------------------------------------------------- */
  const cache = {
    user: null,
    profile: null,
    goal: null,
    diaryToday: { meals: { cafe: [], almoco: [], lanche: [], jantar: [] }, totals: { kcal: 0, protein: 0, carbs: 0, fat: 0 } },
    waterLiters: 0,
    foods: [],
    recipes: [],
    workouts: [],
    evolution: null,
    billing: null,
    calendarSessions: {}, // "yyyy-mm-dd" -> session
    calendarCursor: new Date(),
  };

  /* ---------------------------------------------------------
     HELPERS
  --------------------------------------------------------- */
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const fmt = (n) => Math.round(n || 0).toLocaleString('pt-BR');
  const fmt1 = (n) => (n || 0).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const pct = (a, b) => (!b ? 0 : Math.max(0, Math.min(100, Math.round((a / b) * 100))));

  function toast(msg) {
    const stack = $('#toastStack');
    const el = document.createElement('div');
    el.className = 'toast';
    el.textContent = msg;
    stack.appendChild(el);
    setTimeout(() => el.remove(), 3000);
  }

  function openModal(html) {
    $('#modalRoot').innerHTML = html;
    $('#modalOverlay').classList.add('is-open');
  }
  function closeModal() {
    $('#modalOverlay').classList.remove('is-open');
    $('#modalRoot').innerHTML = '';
  }
  $('#modalOverlay').addEventListener('click', (e) => { if (e.target.id === 'modalOverlay') closeModal(); });

  function friendlyError(err) {
    if (err?.data?.code === 'PRO_REQUIRED') {
      return 'Esse recurso é exclusivo do plano PRO. Vá em Perfil → Assinatura pra liberar.';
    }
    return (err && err.message) || 'Algo deu errado. Tente novamente.';
  }

  /* ---------------------------------------------------------
     SUBTABS (genérico — usado no auth screen e nas telas internas)
  --------------------------------------------------------- */
  function setupSubtabs() {
    $$('.subtabs').forEach((group) => {
      const buttons = $$('.subtab', group);
      buttons.forEach((btn) => {
        btn.addEventListener('click', () => {
          buttons.forEach((b) => b.classList.remove('is-active'));
          btn.classList.add('is-active');
          const parent = group.parentElement;
          $$('.subview', parent).forEach((sv) => sv.classList.remove('is-active'));
          const target = $('#sub-' + btn.dataset.sub, parent);
          if (target) target.classList.add('is-active');
        });
      });
    });
  }

  /* ---------------------------------------------------------
     AUTH
  --------------------------------------------------------- */
  function showAuthScreen() {
    $('#authScreen').classList.remove('is-hidden');
    $('#app').classList.remove('is-authed');
  }
  function showApp() {
    $('#authScreen').classList.add('is-hidden');
    $('#app').classList.add('is-authed');
  }

  function setAuthError(id, message) {
    const el = $('#' + id);
    if (!message) { el.hidden = true; el.textContent = ''; return; }
    el.hidden = false;
    el.textContent = message;
  }

  $('#btnLogin').addEventListener('click', async () => {
    const email = $('#loginEmail').value.trim();
    const password = $('#loginPassword').value;
    setAuthError('loginError', null);
    if (!email || !password) return setAuthError('loginError', 'Preencha e-mail e senha.');

    try {
      const { token } = await api.login(email, password);
      api.setToken(token);
      await bootApp();
    } catch (err) {
      setAuthError('loginError', friendlyError(err));
    }
  });

  $('#btnRegister').addEventListener('click', async () => {
    const name = $('#regName').value.trim();
    const email = $('#regEmail').value.trim();
    const password = $('#regPassword').value;
    setAuthError('regError', null);
    if (!name || !email || !password) return setAuthError('regError', 'Preencha todos os campos.');
    if (password.length < 6) return setAuthError('regError', 'A senha precisa ter pelo menos 6 caracteres.');

    try {
      const { token } = await api.register(name, email, password);
      api.setToken(token);
      await bootApp();
      toast(`Bem-vindo ao DayFIT, ${name.split(' ')[0]}! 🎉`);
    } catch (err) {
      setAuthError('regError', friendlyError(err));
    }
  });

  $('#btnLogout').addEventListener('click', () => {
    api.setToken(null);
    Object.assign(cache, {
      user: null, profile: null, goal: null,
      diaryToday: { meals: { cafe: [], almoco: [], lanche: [], jantar: [] }, totals: { kcal: 0, protein: 0, carbs: 0, fat: 0 } },
      waterLiters: 0, foods: [], recipes: [], workouts: [], evolution: null, billing: null, calendarSessions: {},
    });
    showAuthScreen();
    toast('Você saiu da sua conta.');
  });

  async function checkAuthOnLoad() {
    const token = api.getToken();
    if (!token) return showAuthScreen();
    try {
      await bootApp();
    } catch (err) {
      api.setToken(null);
      showAuthScreen();
    }
  }

  /* ---------------------------------------------------------
     BOOTSTRAP — carrega tudo da API e renderiza
  --------------------------------------------------------- */
  async function bootApp() {
    const { user } = await api.me();
    cache.user = user;
    cache.profile = user.profile;
    cache.goal = user.goal;
    cache.billing = user.subscription;

    showApp();

    const now = new Date();
    const [diaryToday, waterToday, workouts, evolution, calendar] = await Promise.all([
      api.getDiaryToday(),
      api.getWaterToday(),
      api.getWorkouts(),
      api.getEvolution(),
      api.getWorkoutCalendar(now.getFullYear(), now.getMonth() + 1),
    ]);

    cache.diaryToday = diaryToday;
    cache.waterLiters = waterToday.totalLiters;
    cache.workouts = workouts.workouts;
    cache.evolution = evolution;
    indexCalendarSessions(calendar.sessions);

    renderAll();
    await Promise.all([refreshFoodLibrary(), refreshRecipes(), refreshDietPlanPanel()]);
  }

  async function refreshDietPlanPanel() {
    try {
      const { dietPlan } = await api.getLatestDietPlan();
      cache.dietPlan = dietPlan;
      const panel = $('#myDietPlanPanel');
      if (!dietPlan) { panel.style.display = 'none'; return; }
      panel.style.display = '';
      $('#myDietPlanTitle').textContent = dietPlan.title;
      $('#myDietPlanKcal').textContent = `${dietPlan.totalKcal} kcal`;
      $('#myDietPlanProtein').textContent = `${dietPlan.totalProtein} g`;
    } catch (err) { /* silencioso — painel só não aparece */ }
  }

  function indexCalendarSessions(sessions) {
    cache.calendarSessions = {};
    (sessions || []).forEach((s) => {
      const key = new Date(s.performedAt).toISOString().slice(0, 10);
      cache.calendarSessions[key] = s;
    });
  }

  function todayKey() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  async function refreshDiaryAndXp() {
    const [diaryToday, evolution] = await Promise.all([api.getDiaryToday(), api.getEvolution()]);
    cache.diaryToday = diaryToday;
    cache.evolution = evolution;
    renderDashboard(); renderNutrition(); renderEvolution();
  }

  /* ---------------------------------------------------------
     NAVIGATION
  --------------------------------------------------------- */
  function showView(view) {
    $$('.view').forEach((v) => v.classList.remove('is-active'));
    const target = $('#view-' + view);
    if (target) target.classList.add('is-active');
    $$('.nav-item').forEach((b) => b.classList.toggle('is-active', b.dataset.view === view));
    $$('.bnav-item').forEach((b) => b.classList.toggle('is-active', b.dataset.view === view));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  $$('[data-view]').forEach((el) => el.addEventListener('click', () => showView(el.dataset.view)));
  $('#topbarProfileBtn').addEventListener('click', () => showView('profile'));

  /* ---------------------------------------------------------
     TODAY'S WORKOUT (rotação automática entre os treinos cadastrados)
  --------------------------------------------------------- */
  function getTodayWorkout() {
    if (!cache.workouts.length) return null;
    const idx = new Date().getDay() % cache.workouts.length;
    return cache.workouts[idx];
  }
  function estimateWorkoutMinutes(w) { return Math.round((w.exercises || []).length * 4.6); }

  function todaysWorkoutMinutes() {
    const session = cache.calendarSessions[todayKey()];
    return session ? session.durationMin : 0;
  }

  /* ---------------------------------------------------------
     RENDER: DASHBOARD
  --------------------------------------------------------- */
  function renderGreeting() {
    const h = new Date().getHours();
    const g = h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite';
    const first = cache.user ? cache.user.name.split(' ')[0] : '';
    $('#greeting').textContent = `${g}, ${first} 👋`;
  }

  function renderDashboard() {
    if (!cache.goal) return;
    const g = cache.goal, t = cache.diaryToday.totals;

    $('#statCalNow').textContent = fmt(t.kcal);
    $('#statCalGoal').textContent = fmt(g.calories);
    $('#statProtNow').textContent = fmt(t.protein);
    $('#statProtGoal').textContent = fmt(g.protein);
    $('#statWaterNow').textContent = fmt1(cache.waterLiters);
    $('#statWaterGoal').textContent = fmt1(g.waterLiters);
    $('#statWorkoutMin').textContent = todaysWorkoutMinutes();

    $('#barCal').style.width = pct(t.kcal, g.calories) + '%';
    $('#barProt').style.width = pct(t.protein, g.protein) + '%';
    $('#barWater').style.width = pct(cache.waterLiters, g.waterLiters) + '%';

    const objMeta = OBJECTIVES.find((o) => o.id === (cache.profile && cache.profile.objective)) || OBJECTIVES[0];
    $('#goalObjectiveName').textContent = objMeta.name;
    $('#goalMiniCal').textContent = fmt(g.calories) + ' kcal';
    $('#goalMiniProt').textContent = fmt(g.protein) + ' g';
    $('#goalMiniWater').textContent = fmt1(g.waterLiters) + ' L';
    $('#goalMiniWorkouts').textContent = g.workoutsPerWeek;

    const w = getTodayWorkout();
    if (w) {
      $('#todayWorkoutName').textContent = w.name.includes('—') ? w.name.split('—')[1].trim() : w.name;
      $('#todayWorkoutCount').textContent = w.exercises.length + ' exercícios';
      $('#todayWorkoutTime').textContent = '≈ ' + estimateWorkoutMinutes(w) + ' min';
    }

    if (cache.evolution) {
      $('#dashLevel').textContent = cache.evolution.xp.level;
      $('#dashXpFill').style.width = pct(cache.evolution.xp.current, cache.evolution.xp.max) + '%';
      $('#sideStreak').textContent = cache.evolution.streak;
      $('#streakDaysBig').textContent = cache.evolution.streak;
      drawLineChart($('#weightChartMini'), cache.evolution.weightSeries, { compact: true });
    }
  }

  /* ---------------------------------------------------------
     RENDER: NUTRITION
  --------------------------------------------------------- */
  function renderNutrition() {
    if (!cache.goal) return;
    const g = cache.goal, t = cache.diaryToday.totals;
    $('#macCalNow').textContent = fmt(t.kcal); $('#macCalGoal').textContent = fmt(g.calories);
    $('#macProtNow').textContent = fmt(t.protein); $('#macProtGoal').textContent = fmt(g.protein);
    $('#macCarbNow').textContent = fmt(t.carbs); $('#macCarbGoal').textContent = fmt(g.carbs);
    $('#macFatNow').textContent = fmt(t.fat); $('#macFatGoal').textContent = fmt(g.fat);

    const list = $('#mealList');
    list.innerHTML = Object.keys(MEAL_LABELS).map((key) => {
      const items = cache.diaryToday.meals[key] || [];
      const kcal = items.reduce((s, i) => s + i.kcal, 0);
      return `<div class="meal-block">
        <div class="meal-block-head"><span>${MEAL_LABELS[key]}</span><span class="meal-kcal">${fmt(kcal)} kcal</span></div>
        <div class="meal-items">
          ${items.length ? items.map((i) => `<div class="meal-item"><span class="meal-item-name">🍽️ ${i.name}</span><span class="meal-item-macros">${Math.round(i.kcal)} kcal · ${Math.round(i.protein)}g prot</span></div>`).join('') : `<div class="meal-empty">Nenhum alimento registrado ainda.</div>`}
        </div>
      </div>`;
    }).join('');
  }

  let foodChipFilter = 'todos';
  async function refreshFoodLibrary(query) {
    const q = query !== undefined ? query : ($('#foodSearchInput') ? $('#foodSearchInput').value : '');
    const chips = $('#foodCategoryChips');
    chips.innerHTML = FOOD_CATS.map((c) => `<button class="chip ${c.id === foodChipFilter ? 'is-active' : ''}" data-cat="${c.id}">${c.ico} ${c.name}</button>`).join('');
    $$('.chip', chips).forEach((chip) => {
      chip.addEventListener('click', () => { foodChipFilter = chip.dataset.cat; refreshFoodLibrary(); });
    });

    try {
      const { foods } = await api.getFoods({ category: foodChipFilter, q: q || '' });
      cache.foods = foods;
      const grid = $('#foodGrid');
      grid.innerHTML = foods.map((f) => `
        <div class="food-card" data-food="${f.id}">
          <div class="food-card-top"><span class="food-card-ico">${f.icon}</span><div><div class="food-card-name">${f.name}</div><div class="food-card-cat">${f.portion}</div></div></div>
          <div class="food-card-macros"><span>${Math.round(f.kcal)} kcal</span><span>${f.protein}g P</span><span>${f.carbs}g C</span><span>${f.fat}g G</span></div>
        </div>`).join('') || `<p class="muted">Nenhum alimento encontrado.</p>`;
      $$('.food-card', grid).forEach((card) => card.addEventListener('click', () => openFoodDetail(card.dataset.food)));
    } catch (err) { toast(friendlyError(err)); }
  }

  function openFoodDetail(id) {
    const f = cache.foods.find((x) => x.id === id);
    if (!f) return;
    openModal(`
      <div class="modal-head"><h2>${f.icon} ${f.name}</h2><button class="modal-close" data-close>✕</button></div>
      <p class="muted" style="margin-bottom:14px">Porção de referência: ${f.portion}</p>
      <div class="analysis-macros">
        <div><strong>${Math.round(f.kcal)}</strong><span>kcal</span></div>
        <div><strong>${f.protein}g</strong><span>proteína</span></div>
        <div><strong>${f.carbs}g</strong><span>carbo</span></div>
        <div><strong>${f.fat}g</strong><span>gordura</span></div>
      </div>
      <p class="disclaimer">Fibras: ${f.fiber}g. Valores nutricionais gerais e aproximados; podem variar conforme marca e preparo.</p>
      <div class="field-row"><label>Adicionar em</label>
        <select id="foodMealSelect">
          <option value="cafe">Café da manhã</option><option value="almoco">Almoço</option>
          <option value="lanche">Lanche</option><option value="jantar">Jantar</option>
        </select>
      </div>
      <button class="btn btn--primary" id="btnAddFoodToDiary" style="width:100%">Adicionar ao meu diário</button>
    `);
    $('[data-close]').addEventListener('click', closeModal);
    $('#btnAddFoodToDiary').addEventListener('click', async () => {
      try {
        await api.addDiaryFromFood(f.id, $('#foodMealSelect').value);
        closeModal();
        toast('Refeição adicionada! 🍽️');
        await refreshDiaryAndXp();
      } catch (err) { toast(friendlyError(err)); }
    });
  }

  let recipeChipFilter = 'todos';
  async function refreshRecipes() {
    const chips = $('#recipeCategoryChips');
    chips.innerHTML = RECIPE_CATS.map((c) => `<button class="chip ${c.id === recipeChipFilter ? 'is-active' : ''}" data-cat="${c.id}">${c.name}</button>`).join('');
    $$('.chip', chips).forEach((chip) => { chip.addEventListener('click', () => { recipeChipFilter = chip.dataset.cat; refreshRecipes(); }); });

    try {
      const { recipes } = await api.getRecipes({ category: recipeChipFilter });
      cache.recipes = recipes;
      const grid = $('#recipeGrid');
      grid.innerHTML = recipes.map((r) => `
        <div class="recipe-card" data-recipe="${r.id}">
          <div class="recipe-thumb">${r.icon}</div>
          <div class="recipe-body">
            <div class="recipe-name">${r.name}</div>
            <div class="recipe-meta"><span>⏱ ${r.timeLabel}</span><span>📶 ${r.difficulty}</span><span>🔥 ${Math.round(r.kcal)} kcal</span><span>🥩 ${r.protein}g</span></div>
          </div>
        </div>`).join('');
      $$('.recipe-card', grid).forEach((card) => card.addEventListener('click', () => openRecipeDetail(card.dataset.recipe)));
    } catch (err) { toast(friendlyError(err)); }
  }

  function openRecipeDetail(id) {
    const r = cache.recipes.find((x) => x.id === id);
    if (!r) return;
    openModal(`
      <div class="modal-head"><h2>${r.name}</h2><button class="modal-close" data-close>✕</button></div>
      <div class="recipe-modal-img">${r.icon}</div>
      <div class="analysis-macros">
        <div><strong>${Math.round(r.kcal)}</strong><span>kcal</span></div>
        <div><strong>${r.protein}g</strong><span>proteína</span></div>
        <div><strong>${r.timeLabel}</strong><span>tempo</span></div>
        <div><strong>${r.difficulty}</strong><span>dificuldade</span></div>
      </div>
      <div class="recipe-modal-section"><h4>Ingredientes</h4><ul>${r.ingredients.map((i) => `<li>${i}</li>`).join('')}</ul></div>
      <div class="recipe-modal-section"><h4>Modo de preparo</h4><ol>${r.steps.map((s) => `<li>${s}</li>`).join('')}</ol></div>
      <div class="field-row"><label>Adicionar em</label>
        <select id="recipeMealSelect">
          <option value="cafe">Café da manhã</option><option value="almoco">Almoço</option>
          <option value="lanche">Lanche</option><option value="jantar">Jantar</option>
        </select>
      </div>
      <button class="btn btn--primary" id="btnAddRecipeToDiary" style="width:100%">Adicionar ao meu diário</button>
    `);
    $('[data-close]').addEventListener('click', closeModal);
    $('#btnAddRecipeToDiary').addEventListener('click', async () => {
      try {
        await api.addDiaryFromRecipe(r.id, $('#recipeMealSelect').value);
        closeModal();
        toast('Refeição adicionada! 🍽️');
        await refreshDiaryAndXp();
      } catch (err) { toast(friendlyError(err)); }
    });
  }

  /* --- Plate analysis (simulada no backend por enquanto) --- */
  function openPlateAnalysis() {
    openModal(`
      <div class="modal-head"><h2>📸 Analisar prato</h2><button class="modal-close" data-close>✕</button></div>
      <div class="upload-zone" id="uploadZone">
        <span class="up-ico">📷</span>
        <strong>Toque para tirar uma foto do prato</strong>
        <p style="margin-top:6px; font-size:12.5px;">Abre a câmera do seu celular (ou a galeria/webcam no computador).</p>
      </div>
      <input type="file" id="plateFileInput" accept="image/*" capture="environment" style="display:none">
      <button class="btn btn--primary" id="btnRunAnalysis" style="width:100%; margin-top:16px;" disabled>Analisar prato</button>
    `);
    $('[data-close]').addEventListener('click', closeModal);

    let photoDataUrl = null;
    const zone = $('#uploadZone');
    const fileInput = $('#plateFileInput');
    const runBtn = $('#btnRunAnalysis');
    zone.addEventListener('click', () => fileInput.click());

    fileInput.addEventListener('change', () => {
      const file = fileInput.files && fileInput.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (e) => {
        photoDataUrl = e.target.result;
        zone.innerHTML = `<img src="${photoDataUrl}" alt="Foto do prato" style="max-height:180px; border-radius:12px; margin:0 auto 10px; display:block;">
          <strong>Foto capturada ✅</strong>
          <p style="margin-top:6px; font-size:12px; color:var(--text-faint);">Toque na imagem para tirar outra foto.</p>`;
        runBtn.disabled = false;
      };
      reader.readAsDataURL(file);
    });

    runBtn.addEventListener('click', async () => {
      if (!photoDataUrl) return;
      openModal(`
        <div class="modal-head"><h2>Analisando refeição…</h2></div>
        <div class="spinner"></div>
        <p class="muted" style="text-align:center">Identificando alimentos e estimando valores nutricionais…</p>
      `);
      try {
        const { analysis } = await api.analyzePlate('almoco');
        setTimeout(() => showAnalysisResult(analysis, photoDataUrl), 900);
      } catch (err) {
        closeModal();
        toast(friendlyError(err));
      }
    });
  }

  function showAnalysisResult(result, photoDataUrl) {
    openModal(`
      <div class="modal-head"><h2>Análise da refeição</h2><button class="modal-close" data-close>✕</button></div>
      ${photoDataUrl ? `<img src="${photoDataUrl}" alt="Foto do prato analisado" style="width:100%; max-height:200px; object-fit:cover; border-radius:14px; margin-bottom:14px;">` : ''}
      <div class="analysis-result-list">
        ${result.items.map((i) => `<div class="analysis-result-item">${i.icon} ${i.name}</div>`).join('')}
      </div>
      <div class="analysis-macros">
        <div><strong>${result.kcal}</strong><span>kcal</span></div>
        <div><strong>${result.protein}g</strong><span>proteína</span></div>
        <div><strong>${result.carbs}g</strong><span>carbo</span></div>
        <div><strong>${result.fat}g</strong><span>gordura</span></div>
      </div>
      <p class="modal-note">${result.disclaimer}</p>
      <div class="field-row"><label>Adicionar em</label>
        <select id="analysisMealSelect">
          <option value="almoco">Almoço</option><option value="cafe">Café da manhã</option>
          <option value="lanche">Lanche</option><option value="jantar">Jantar</option>
        </select>
      </div>
      <button class="btn btn--primary" id="btnAddAnalysisToDiary" style="width:100%">Adicionar ao meu diário</button>
    `);
    $('[data-close]').addEventListener('click', closeModal);
    $('#btnAddAnalysisToDiary').addEventListener('click', async () => {
      try {
        await api.confirmPlateAnalysis({
          meal: $('#analysisMealSelect').value,
          name: 'Prato analisado (arroz, frango, salada, batata)',
          kcal: result.kcal, protein: result.protein, carbs: result.carbs, fat: result.fat,
        });
        closeModal();
        toast('Refeição adicionada! 🍽️');
        await refreshDiaryAndXp();
      } catch (err) { toast(friendlyError(err)); }
    });
  }

  function openAddFoodModal() {
    openModal(`
      <div class="modal-head"><h2>Adicionar alimento</h2><button class="modal-close" data-close>✕</button></div>
      <div class="search-bar" style="margin-bottom:14px;"><span>🔎</span><input type="text" id="quickFoodSearch" placeholder="Pesquisar alimento..."></div>
      <div id="quickFoodResults" class="analysis-result-list"></div>
    `);
    $('[data-close]').addEventListener('click', closeModal);
    const renderResults = async (q) => {
      try {
        const { foods } = await api.getFoods({ q });
        $('#quickFoodResults').innerHTML = foods.slice(0, 8).map((f) => `<div class="analysis-result-item" data-pick="${f.id}" style="cursor:pointer; justify-content:space-between;"><span>${f.icon} ${f.name}</span><span class="muted-tag">${Math.round(f.kcal)} kcal</span></div>`).join('') || '<p class="muted">Nenhum resultado.</p>';
        $$('[data-pick]').forEach((row) => row.addEventListener('click', () => { const id = row.dataset.pick; closeModal(); const found = cache.foods.find(x=>x.id===id) || foods.find(x=>x.id===id); if(found && !cache.foods.some(x=>x.id===id)) cache.foods.push(found); openFoodDetail(id); }));
      } catch (err) { toast(friendlyError(err)); }
    };
    renderResults('');
    $('#quickFoodSearch').addEventListener('input', (e) => renderResults(e.target.value));
  }

  /* ---------------------------------------------------------
     RENDER: WORKOUTS
  --------------------------------------------------------- */
  function renderWorkouts() {
    const grid = $('#workoutGrid');
    grid.innerHTML = cache.workouts.map((w) => {
      const done = (w.completedIndexes || []).length;
      return `<div class="workout-card" data-workout="${w.code}">
        <div class="workout-card-head"><div class="workout-card-name">${w.name}</div><span class="workout-card-tag">${w.tag}</span></div>
        <div class="workout-progress-label">${done} / ${w.exercises.length} exercícios</div>
        <div class="bar"><div class="bar-fill" style="width:${pct(done, w.exercises.length)}%"></div></div>
        <div class="exercise-list">
          ${w.exercises.map((ex, idx) => {
            const isDone = (w.completedIndexes || []).includes(idx);
            return `<div class="exercise-row ${isDone ? 'is-done' : ''}">
              <span class="exercise-check ${isDone ? 'is-checked' : ''}" data-workout="${w.code}" data-idx="${idx}">${isDone ? '✓' : ''}</span>
              <span class="exercise-name">${ex.name}</span><span class="exercise-sets">${ex.sets}</span>
            </div>`;
          }).join('')}
        </div>
        <button class="btn btn--primary" data-start-workout="${w.code}" style="width:100%">Começar treino</button>
      </div>`;
    }).join('');

    $$('.exercise-check', grid).forEach((box) => {
      box.addEventListener('click', async () => {
        const code = box.dataset.workout, idx = Number(box.dataset.idx);
        const w = cache.workouts.find((x) => x.code === code);
        const isDone = (w.completedIndexes || []).includes(idx);
        try {
          await api.setExerciseProgress(code, idx, !isDone);
          w.completedIndexes = isDone ? w.completedIndexes.filter((i) => i !== idx) : [...(w.completedIndexes || []), idx];
          renderWorkouts();
        } catch (err) { toast(friendlyError(err)); }
      });
    });
    $$('[data-start-workout]', grid).forEach((btn) => btn.addEventListener('click', () => startWorkoutSession(btn.dataset.startWorkout)));
  }

  /* --- workout session / timer --- */
  let session = null;

  function startWorkoutSession(workoutCode) {
    const workout = cache.workouts.find((w) => w.code === workoutCode);
    if (!workout) return toast('Treino não encontrado.');
    session = { workout, index: 0, seconds: 0, paused: false, timerHandle: null };
    $('#sessionOverlay').classList.add('is-open');
    updateSessionUI();
    session.timerHandle = setInterval(() => {
      if (!session.paused) {
        session.seconds++;
        $('#sessionTimer').textContent = formatTime(session.seconds);
        $('#miniTimerClock').textContent = formatTime(session.seconds);
      }
    }, 1000);
  }

  function updateSessionUI() {
    const ex = session.workout.exercises[session.index];
    $('#sessionExerciseName').textContent = ex.name;
    $('#sessionExerciseSets').textContent = ex.sets;
    $('#sessionProgressBar').style.width = pct(session.index, session.workout.exercises.length) + '%';
    $('#sessionProgressLabel').textContent = `${session.index} / ${session.workout.exercises.length} exercícios`;
    $('#sessionTimer').textContent = formatTime(session.seconds);
    $('#miniTimerName').textContent = ex.name;
    $('#miniTimerClock').textContent = formatTime(session.seconds);
  }

  function showMiniTimer() { if (session) { $('#miniTimerBar').classList.add('is-visible'); updateSessionUI(); } }
  function hideMiniTimer() { $('#miniTimerBar').classList.remove('is-visible'); }

  function formatTime(total) {
    const h = String(Math.floor(total / 3600)).padStart(2, '0');
    const m = String(Math.floor((total % 3600) / 60)).padStart(2, '0');
    const s = String(total % 60).padStart(2, '0');
    return `${h}:${m}:${s}`;
  }

  $('#sessionPause').addEventListener('click', () => {
    if (!session) return;
    session.paused = !session.paused;
    $('#sessionPause').textContent = session.paused ? '▶ Retomar' : '⏸ Pausar';
  });

  $('#sessionNext').addEventListener('click', () => {
    if (!session) return;
    if (session.index < session.workout.exercises.length - 1) { session.index++; updateSessionUI(); }
    else toast('Este é o último exercício do treino.');
  });

  $('#sessionComplete').addEventListener('click', async () => {
    if (!session) return;
    const code = session.workout.code, idx = session.index;
    try {
      await api.setExerciseProgress(code, idx, true);
      const w = cache.workouts.find((x) => x.code === code);
      if (w && !(w.completedIndexes || []).includes(idx)) w.completedIndexes = [...(w.completedIndexes || []), idx];
      toast('Série concluída ✓');
      if (session.index < session.workout.exercises.length - 1) { session.index++; updateSessionUI(); }
    } catch (err) { toast(friendlyError(err)); }
  });

  function minimizeSession() {
    if (!session) return;
    $('#sessionOverlay').classList.remove('is-open');
    showMiniTimer();
    toast('Treino continua rodando em segundo plano ⏱');
  }
  $('#sessionMinimize').addEventListener('click', minimizeSession);
  $('#sessionOverlay').addEventListener('click', (e) => { if (e.target.id === 'sessionOverlay') minimizeSession(); });
  $('#miniTimerBar').addEventListener('click', () => { hideMiniTimer(); $('#sessionOverlay').classList.add('is-open'); updateSessionUI(); });

  $('#sessionFinish').addEventListener('click', finishWorkoutSession);

  async function finishWorkoutSession() {
    if (!session) return;
    clearInterval(session.timerHandle);
    const durationMin = Math.max(1, Math.round(session.seconds / 60));
    const workoutCode = session.workout.code;

    $('#sessionOverlay').classList.remove('is-open');
    hideMiniTimer();

    try {
      const { session: result } = await api.finishWorkoutSession(workoutCode, durationMin);
      openModal(`
        <div class="modal-head"><h2>Treino concluído 🎉</h2><button class="modal-close" data-close>✕</button></div>
        <div class="analysis-macros">
          <div><strong>${result.durationMin} min</strong><span>duração</span></div>
          <div><strong>${result.exercisesCompleted}/${result.totalExercises}</strong><span>exercícios</span></div>
          <div><strong>${result.caloriesEstimate}</strong><span>kcal estimadas</span></div>
          <div><strong>${new Date(result.performedAt).toLocaleDateString('pt-BR')}</strong><span>data</span></div>
        </div>
        <button class="btn btn--primary" id="btnCloseFinish" style="width:100%">Fechar</button>
      `);
      $$('[data-close], #btnCloseFinish').forEach((el) => el.addEventListener('click', closeModal));
      toast('Treino concluído! 🔥');

      const now = new Date();
      const [calendar, evolution] = await Promise.all([
        api.getWorkoutCalendar(now.getFullYear(), now.getMonth() + 1),
        api.getEvolution(),
      ]);
      indexCalendarSessions(calendar.sessions);
      cache.evolution = evolution;
      session = null;
      renderDashboard(); renderCalendar(); renderEvolution();
    } catch (err) {
      toast(friendlyError(err));
      session = null;
    }
  }

  /* --- Calendário --- */
  function renderCalendar() {
    const monthNames = ['JANEIRO', 'FEVEREIRO', 'MARÇO', 'ABRIL', 'MAIO', 'JUNHO', 'JULHO', 'AGOSTO', 'SETEMBRO', 'OUTUBRO', 'NOVEMBRO', 'DEZEMBRO'];
    const calDate = cache.calendarCursor;
    $('#calMonthLabel').textContent = `${monthNames[calDate.getMonth()]} ${calDate.getFullYear()}`;

    const grid = $('#calendarGrid');
    const dows = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];
    let html = dows.map((d) => `<div class="cal-dow">${d}</div>`).join('');

    const year = calDate.getFullYear(), month = calDate.getMonth();
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const todayStr = todayKey();

    for (let i = 0; i < firstDay; i++) html += `<div class="cal-day is-empty"></div>`;
    for (let d = 1; d <= daysInMonth; d++) {
      const key = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const hasWorkout = !!cache.calendarSessions[key];
      const isToday = key === todayStr;
      html += `<div class="cal-day ${hasWorkout ? 'has-workout' : ''} ${isToday ? 'is-today' : ''}" data-day="${key}">${d}</div>`;
    }
    grid.innerHTML = html;
    $$('.cal-day[data-day]', grid).forEach((cell) => cell.addEventListener('click', () => showCalendarDay(cell.dataset.day)));
  }

  function showCalendarDay(key) {
    const detail = $('#calDayDetail');
    detail.hidden = false;
    const [, m, d] = key.split('-');
    $('#calDayTitle').textContent = `${d}/${m}`;
    const record = cache.calendarSessions[key];
    if (record) {
      $('#calDayBody').innerHTML = `
        <div class="goal-mini-grid">
          <div><span>Treino</span><strong>${record.workoutName.includes('—') ? record.workoutName.split('—')[1] : record.workoutName}</strong></div>
          <div><span>Duração</span><strong>${record.durationMin} minutos</strong></div>
          <div><span>Status</span><strong>Concluído</strong></div>
          <div><span>Exercícios</span><strong>${record.exercisesCompleted}/${record.totalExercises}</strong></div>
        </div>`;
    } else {
      $('#calDayBody').innerHTML = `<p class="muted">Nenhum treino registrado neste dia.</p>`;
    }
  }

  $('#calPrev').addEventListener('click', async () => {
    cache.calendarCursor.setMonth(cache.calendarCursor.getMonth() - 1);
    await reloadCalendarMonth();
  });
  $('#calNext').addEventListener('click', async () => {
    cache.calendarCursor.setMonth(cache.calendarCursor.getMonth() + 1);
    await reloadCalendarMonth();
  });
  async function reloadCalendarMonth() {
    const d = cache.calendarCursor;
    try {
      const { sessions } = await api.getWorkoutCalendar(d.getFullYear(), d.getMonth() + 1);
      indexCalendarSessions(sessions);
      renderCalendar();
    } catch (err) { toast(friendlyError(err)); }
  }

  /* ---------------------------------------------------------
     RENDER: GOALS
  --------------------------------------------------------- */
  function renderGoals() {
    if (!cache.goal) return;
    const g = cache.goal;
    $('#gCal').textContent = fmt(g.calories);
    $('#gProt').textContent = fmt(g.protein);
    $('#gWater').textContent = fmt1(g.waterLiters);
    $('#gWorkouts').textContent = g.workoutsPerWeek;

    const objGrid = $('#objectiveGrid');
    const currentObjective = cache.profile ? cache.profile.objective : 'massa';
    objGrid.innerHTML = OBJECTIVES.map((o) => `
      <div class="objective-card ${o.id === currentObjective ? 'is-active' : ''}" data-obj="${o.id}">
        <div class="objective-ico">${o.ico}</div><div class="objective-name">${o.name}</div>
      </div>`).join('');
    $$('.objective-card', objGrid).forEach((card) => {
      card.addEventListener('click', async () => {
        try {
          const { profile, goal } = await api.setObjective(card.dataset.obj);
          cache.profile = profile; cache.goal = goal;
          renderAll();
          toast(`Objetivo atualizado: ${OBJECTIVES.find((o) => o.id === card.dataset.obj).name}`);
        } catch (err) { toast(friendlyError(err)); }
      });
    });
  }

  $('#btnGenerateWorkout').addEventListener('click', async () => {
    const btn = $('#btnGenerateWorkout');
    const original = btn.innerHTML;
    btn.disabled = true; btn.innerHTML = '<span>⏳</span>Montando seu treino...';
    try {
      const { workout } = await api.generateWorkoutPlan();
      const { workouts } = await api.getWorkouts();
      cache.workouts = workouts;
      renderWorkouts();
      toast(`Treino "${workout.name}" criado! Já está na sua lista de treinos.`);
    } catch (err) {
      toast(friendlyError(err));
    } finally {
      btn.disabled = false; btn.innerHTML = original;
    }
  });

  $('#btnGenerateDiet').addEventListener('click', async () => {
    const btn = $('#btnGenerateDiet');
    const original = btn.innerHTML;
    btn.disabled = true; btn.innerHTML = '<span>⏳</span>Preparando sua dieta...';
    try {
      const { dietPlan } = await api.generateDietPlan();
      await refreshDietPlanPanel();
      showDietPlanModal(dietPlan);
    } catch (err) {
      toast(friendlyError(err));
    } finally {
      btn.disabled = false; btn.innerHTML = original;
    }
  });

  $('#btnViewDietPlan').addEventListener('click', () => {
    if (cache.dietPlan) showDietPlanModal(cache.dietPlan);
  });

  function showDietPlanModal(plan) {
    const mealLabels = { cafe: 'Café da manhã', almoco: 'Almoço', lanche: 'Lanche', jantar: 'Jantar' };
    const mealsHtml = Object.keys(mealLabels).map((key) => {
      const items = plan.meals[key] || [];
      if (!items.length) return '';
      return `<div class="recipe-modal-section"><h4>${mealLabels[key]}</h4><ul>${items.map((i) => `<li>${i.name} — ${Math.round(i.kcal)} kcal, ${Math.round(i.protein)}g proteína</li>`).join('')}</ul></div>`;
    }).join('');

    openModal(`
      <div class="modal-head"><h2>${plan.title}</h2><button class="modal-close" data-close>✕</button></div>
      <div class="analysis-macros" style="margin-bottom:16px;">
        <div><strong>${plan.totalKcal}</strong><span>kcal/dia</span></div>
        <div><strong>${plan.totalProtein}g</strong><span>proteína/dia</span></div>
      </div>
      ${mealsHtml}
      <button class="btn btn--primary" id="btnApplyDietToday" style="width:100%; margin-top:10px;">Adicionar tudo ao diário de hoje</button>
      <p class="disclaimer">Plano gerado automaticamente com base no seu objetivo e metas. Ajuste como preferir.</p>
    `);
    $('[data-close]').addEventListener('click', closeModal);
    $('#btnApplyDietToday').addEventListener('click', async () => {
      const btn = $('#btnApplyDietToday');
      btn.disabled = true; btn.textContent = 'Adicionando...';
      try {
        for (const [meal, items] of Object.entries(plan.meals)) {
          for (const item of items) {
            await api.addDiaryManual({ meal, name: item.name, kcal: item.kcal, protein: item.protein, carbs: item.carbs || 0, fat: item.fat || 0 });
          }
        }
        const diaryToday = await api.getDiaryToday();
        cache.diaryToday = diaryToday;
        renderAll();
        closeModal();
        toast('Dieta adicionada ao diário de hoje!');
      } catch (err) {
        toast(friendlyError(err));
        btn.disabled = false; btn.textContent = 'Adicionar tudo ao diário de hoje';
      }
    });
  }

  $('#btnGenerateRecipe').addEventListener('click', async () => {
    const btn = $('#btnGenerateRecipe');
    const original = btn.textContent;
    const preference = $('#recipePreferenceInput').value.trim();
    btn.disabled = true; btn.textContent = 'Criando sua receita...';
    try {
      await api.generateRecipe(preference || undefined);
      await refreshRecipes();
      $('#recipePreferenceInput').value = '';
      toast('Receita nova criada! Já está na sua lista.');
    } catch (err) {
      toast(friendlyError(err));
    } finally {
      btn.disabled = false; btn.textContent = original;
    }
  });

  // ===== Montar treino manualmente =====
  function openManualWorkoutModal() {
    openModal(`
      <div class="modal-head"><h2>Criar treino manualmente</h2><button class="modal-close" data-close>✕</button></div>
      <div class="field-row"><label>Nome do treino</label><input type="text" id="mwName" placeholder="ex: Treino de pernas"></div>
      <div class="field-row"><label>Categoria/tag</label><input type="text" id="mwTag" placeholder="ex: Inferior, Empurrar, Corpo Inteiro"></div>
      <label style="font-size:12.5px; color:var(--text-dim); font-weight:600; display:block; margin-bottom:8px;">Exercícios</label>
      <div id="mwExerciseRows" style="display:flex; flex-direction:column; gap:8px; margin-bottom:12px;"></div>
      <button class="btn btn--ghost btn--sm" id="mwAddRow" style="margin-bottom:16px;">+ Adicionar exercício</button>
      <button class="btn btn--primary" id="mwSave" style="width:100%">Salvar treino</button>
    `);
    $('[data-close]').addEventListener('click', closeModal);

    const rowsEl = $('#mwExerciseRows');
    function addRow() {
      const row = document.createElement('div');
      row.style.cssText = 'display:flex; gap:8px;';
      row.innerHTML = `
        <input type="text" placeholder="Nome do exercício" class="mw-ex-name" style="flex:2; background:var(--surface-2); border:1px solid var(--border); border-radius:10px; padding:9px 12px; color:var(--text); font-size:13.5px;">
        <input type="text" placeholder="Séries (ex: 4 × 10)" class="mw-ex-sets" style="flex:1; background:var(--surface-2); border:1px solid var(--border); border-radius:10px; padding:9px 12px; color:var(--text); font-size:13.5px;">
        <button type="button" class="mw-ex-remove" style="background:none; border:none; color:var(--red); font-size:16px; padding:0 6px;">✕</button>
      `;
      row.querySelector('.mw-ex-remove').addEventListener('click', () => row.remove());
      rowsEl.appendChild(row);
    }
    addRow(); addRow(); addRow();
    $('#mwAddRow').addEventListener('click', addRow);

    $('#mwSave').addEventListener('click', async () => {
      const name = $('#mwName').value.trim();
      const tag = $('#mwTag').value.trim();
      const exercises = $$('.mw-ex-name', rowsEl)
        .map((input, i) => ({ name: input.value.trim(), sets: $$('.mw-ex-sets', rowsEl)[i].value.trim() }))
        .filter((e) => e.name);

      if (!name || exercises.length === 0) { toast('Preencha o nome e ao menos um exercício.'); return; }

      const btn = $('#mwSave');
      btn.disabled = true; btn.textContent = 'Salvando...';
      try {
        await api.createWorkout({ name, tag, exercises });
        const { workouts } = await api.getWorkouts();
        cache.workouts = workouts;
        renderWorkouts();
        closeModal();
        toast('Treino criado! Já está na sua lista.');
      } catch (err) {
        toast(friendlyError(err));
        btn.disabled = false; btn.textContent = 'Salvar treino';
      }
    });
  }
  $('#btnOpenManualWorkout').addEventListener('click', openManualWorkoutModal);
  $('#btnOpenManualWorkoutFromGoals').addEventListener('click', openManualWorkoutModal);

  // ===== Montar dieta manualmente =====
  function openManualDietModal() {
    const mealLabels = { cafe: 'Café da manhã', almoco: 'Almoço', lanche: 'Lanche', jantar: 'Jantar' };
    const builderMeals = { cafe: [], almoco: [], lanche: [], jantar: [] };

    function mealListHtml(key) {
      return builderMeals[key].map((item, i) =>
        `<div class="meal-item"><span class="meal-item-name">🍽️ ${item.name}</span><span class="meal-item-macros">${item.kcal} kcal · ${item.protein}g prot <button type="button" class="md-remove" data-meal="${key}" data-idx="${i}" style="background:none;border:none;color:var(--red);margin-left:6px;">✕</button></span></div>`
      ).join('') || '<div class="meal-empty">Nada ainda.</div>';
    }

    function render() {
      openModal(`
        <div class="modal-head"><h2>Montar minha dieta</h2><button class="modal-close" data-close>✕</button></div>
        <div class="field-row"><label>Nome do plano</label><input type="text" id="mdTitle" placeholder="ex: Minha dieta da semana" value="${$('#mdTitle') ? $('#mdTitle').value : ''}"></div>
        ${Object.keys(mealLabels).map((key) => `
          <div class="meal-block" style="margin-bottom:12px;">
            <div class="meal-block-head"><span>${mealLabels[key]}</span></div>
            <div class="meal-items">${mealListHtml(key)}</div>
            <div style="display:flex; gap:6px; padding:10px 16px;">
              <input type="text" class="md-food-search" data-meal="${key}" placeholder="Pesquisar alimento..." style="flex:1; background:var(--surface-2); border:1px solid var(--border); border-radius:10px; padding:8px 10px; color:var(--text); font-size:13px;">
            </div>
            <div class="md-results" data-meal="${key}" style="padding:0 16px 10px; display:flex; flex-direction:column; gap:4px;"></div>
          </div>
        `).join('')}
        <button class="btn btn--primary" id="mdSave" style="width:100%; margin-top:6px;">Salvar dieta</button>
      `);
      $('[data-close]').addEventListener('click', closeModal);

      $$('.md-remove').forEach((btn) => {
        btn.addEventListener('click', () => {
          builderMeals[btn.dataset.meal].splice(Number(btn.dataset.idx), 1);
          render();
        });
      });

      $$('.md-food-search').forEach((input) => {
        input.addEventListener('input', async () => {
          const meal = input.dataset.meal;
          const q = input.value.trim();
          const resultsEl = document.querySelector(`.md-results[data-meal="${meal}"]`);
          if (!q) { resultsEl.innerHTML = ''; return; }
          try {
            const { foods } = await api.getFoods({ q });
            resultsEl.innerHTML = foods.slice(0, 5).map((f) =>
              `<div class="md-pick" data-meal="${meal}" data-food='${JSON.stringify({ name: f.name, kcal: f.kcal, protein: f.protein, carbs: f.carbs, fat: f.fat })}' style="cursor:pointer; font-size:12.5px; color:var(--green-soft); padding:4px 0;">+ ${f.icon} ${f.name} (${f.kcal} kcal)</div>`
            ).join('');
            $$('.md-pick', resultsEl).forEach((pick) => {
              pick.addEventListener('click', () => {
                builderMeals[pick.dataset.meal].push(JSON.parse(pick.dataset.food));
                render();
              });
            });
          } catch (err) { /* silencioso */ }
        });
      });

      $('#mdSave').addEventListener('click', async () => {
        const title = $('#mdTitle').value.trim();
        const totalItems = Object.values(builderMeals).flat().length;
        if (!title || totalItems === 0) { toast('Dê um nome ao plano e adicione ao menos um alimento.'); return; }

        const btn = $('#mdSave');
        btn.disabled = true; btn.textContent = 'Salvando...';
        try {
          await api.createDietManual({ title, meals: builderMeals });
          await refreshDietPlanPanel();
          closeModal();
          toast('Dieta salva!');
        } catch (err) {
          toast(friendlyError(err));
          btn.disabled = false; btn.textContent = 'Salvar dieta';
        }
      });
    }
    render();
  }
  $('#btnOpenManualDiet').addEventListener('click', openManualDietModal);

  // ===== Criar receita manualmente =====
  function openManualRecipeModal() {
    openModal(`
      <div class="modal-head"><h2>Criar receita manualmente</h2><button class="modal-close" data-close>✕</button></div>
      <div class="field-row"><label>Nome</label><input type="text" id="mrName" placeholder="ex: Omelete proteico"></div>
      <div class="field-row"><label>Categoria</label>
        <select id="mrCategory">
          <option value="shakes">Shakes</option><option value="cafe">Café da manhã</option>
          <option value="almoco">Almoço</option><option value="lanches">Lanches</option>
          <option value="jantar">Jantar</option><option value="sobremesas">Sobremesas</option>
        </select>
      </div>
      <div class="field-row"><label>Tempo de preparo</label><input type="text" id="mrTime" placeholder="ex: 15 min"></div>
      <div class="field-row"><label>Dificuldade</label>
        <select id="mrDifficulty"><option>Fácil</option><option>Médio</option><option>Difícil</option></select>
      </div>
      <div style="display:flex; gap:10px;">
        <div class="field-row" style="flex:1;"><label>Calorias</label><input type="number" id="mrKcal" placeholder="ex: 320"></div>
        <div class="field-row" style="flex:1;"><label>Proteína (g)</label><input type="number" id="mrProtein" placeholder="ex: 28"></div>
      </div>
      <div class="field-row"><label>Ingredientes (um por linha)</label><textarea id="mrIngredients" rows="4" style="background:var(--surface-2); border:1px solid var(--border); border-radius:10px; padding:10px 12px; color:var(--text); font-size:14px; resize:vertical;" placeholder="2 ovos&#10;1 fatia de queijo&#10;sal a gosto"></textarea></div>
      <div class="field-row"><label>Modo de preparo (um passo por linha)</label><textarea id="mrSteps" rows="4" style="background:var(--surface-2); border:1px solid var(--border); border-radius:10px; padding:10px 12px; color:var(--text); font-size:14px; resize:vertical;" placeholder="Bata os ovos&#10;Leve à frigideira&#10;Sirva quente"></textarea></div>
      <button class="btn btn--primary" id="mrSave" style="width:100%; margin-top:6px;">Salvar receita</button>
    `);
    $('[data-close]').addEventListener('click', closeModal);
    $('#mrSave').addEventListener('click', async () => {
      const name = $('#mrName').value.trim();
      const ingredients = $('#mrIngredients').value.split('\n').map((s) => s.trim()).filter(Boolean);
      const steps = $('#mrSteps').value.split('\n').map((s) => s.trim()).filter(Boolean);
      if (!name || !ingredients.length || !steps.length) { toast('Preencha nome, ingredientes e modo de preparo.'); return; }

      const btn = $('#mrSave');
      btn.disabled = true; btn.textContent = 'Salvando...';
      try {
        await api.createRecipe({
          name, category: $('#mrCategory').value, timeLabel: $('#mrTime').value.trim() || '—',
          difficulty: $('#mrDifficulty').value, kcal: $('#mrKcal').value, protein: $('#mrProtein').value,
          ingredients, steps,
        });
        await refreshRecipes();
        closeModal();
        toast('Receita criada! Já está na sua lista.');
      } catch (err) {
        toast(friendlyError(err));
        btn.disabled = false; btn.textContent = 'Salvar receita';
      }
    });
  }
  $('#btnOpenManualRecipe').addEventListener('click', openManualRecipeModal);

  $('#btnEditGoals').addEventListener('click', () => {
    const g = cache.goal;
    openModal(`
      <div class="modal-head"><h2>Editar metas</h2><button class="modal-close" data-close>✕</button></div>
      <div class="field-row"><label>Meta de calorias (kcal)</label><input type="number" id="editCal" value="${g.calories}"></div>
      <div class="field-row"><label>Meta de proteína (g)</label><input type="number" id="editProt" value="${g.protein}"></div>
      <div class="field-row"><label>Meta de água (L)</label><input type="number" step="0.1" id="editWater" value="${g.waterLiters}"></div>
      <div class="field-row"><label>Treinos por semana</label><input type="number" id="editWorkouts" value="${g.workoutsPerWeek}"></div>
      <button class="btn btn--primary" id="btnSaveGoals" style="width:100%">Salvar metas</button>
    `);
    $('[data-close]').addEventListener('click', closeModal);
    $('#btnSaveGoals').addEventListener('click', async () => {
      try {
        const { goal } = await api.updateGoals({
          calories: Number($('#editCal').value) || g.calories,
          protein: Number($('#editProt').value) || g.protein,
          waterLiters: Number($('#editWater').value) || g.waterLiters,
          workoutsPerWeek: Number($('#editWorkouts').value) || g.workoutsPerWeek,
        });
        cache.goal = goal;
        renderAll();
        closeModal();
        toast('Metas atualizadas!');
      } catch (err) { toast(friendlyError(err)); }
    });
  });

  /* --- Calculadoras (100% client-side, não precisam da API) --- */
  $('#btnCalcBmi').addEventListener('click', () => {
    const w = Number($('#calcWeight').value), h = Number($('#calcHeight').value) / 100;
    if (!w || !h) return toast('Preencha peso e altura.');
    const bmi = w / (h * h);
    let faixa = 'peso considerado normal';
    if (bmi < 18.5) faixa = 'abaixo do peso considerado normal';
    else if (bmi >= 25 && bmi < 30) faixa = 'acima do peso considerado normal';
    else if (bmi >= 30) faixa = 'faixa de obesidade';
    $('#bmiResult').hidden = false;
    $('#bmiResult').innerHTML = `IMC estimado: <strong>${bmi.toFixed(1)}</strong> — ${faixa}. Este é apenas um indicador geral.`;
  });
  $('#btnCalcCal').addEventListener('click', () => {
    const w = Number($('#calCalWeight').value), act = Number($('#calCalActivity').value);
    if (!w) return toast('Informe o peso.');
    $('#calResult').hidden = false;
    $('#calResult').innerHTML = `Estimativa: <strong>${fmt(w * 24 * act)} kcal/dia</strong> para manutenção de peso.`;
  });
  $('#btnCalcProt').addEventListener('click', () => {
    const w = Number($('#calProtWeight').value), factor = Number($('#calProtGoalSelect').value);
    if (!w) return toast('Informe o peso.');
    $('#protResult').hidden = false;
    $('#protResult').innerHTML = `Estimativa: <strong>${Math.round(w * factor)} g de proteína/dia</strong>.`;
  });
  $('#btnCalcWater').addEventListener('click', () => {
    const w = Number($('#calWaterWeight').value);
    if (!w) return toast('Informe o peso.');
    $('#waterResult').hidden = false;
    $('#waterResult').innerHTML = `Estimativa: <strong>${(w * 0.035).toFixed(1)} L de água/dia</strong>.`;
  });

  /* ---------------------------------------------------------
     RENDER: EVOLUTION
  --------------------------------------------------------- */
  function renderEvolution() {
    const ev = cache.evolution;
    if (!ev) return;
    const ws = ev.weightSeries;
    $('#evWeight').textContent = ws.length ? `${fmt1(ws[0])} → ${fmt1(ws[ws.length - 1])} kg` : 'Sem registros ainda';
    const avgCal = ev.caloriesWeek.length ? Math.round(ev.caloriesWeek.reduce((a, b) => a + b, 0) / ev.caloriesWeek.length) : 0;
    $('#evCal').textContent = `${fmt(avgCal)} kcal/dia`;
    $('#evProt').textContent = `${ev.avgProtein7d} g/dia`;
    $('#evWorkouts').textContent = ev.workoutsPerWeekSeries.reduce((a, b) => a + b, 0);
    $('#evStreak').textContent = ev.streak + ' dias';

    drawLineChart($('#weightChartFull'), ws, {});
    drawBarChart($('#calChart'), ev.caloriesWeek, ev.caloriesWeekLabels || ['S', 'T', 'Q', 'Q', 'S', 'S', 'D']);
    drawBarChart($('#workoutChart'), ev.workoutsPerWeekSeries, ['Sem 1', 'Sem 2', 'Sem 3', 'Sem 4']);

    $('#xpLevel').textContent = ev.xp.level;
    $('#xpLevelName').textContent = ev.xp.levelName;
    $('#xpNow').textContent = fmt(ev.xp.current);
    $('#xpMax').textContent = fmt(ev.xp.max);
    $('#xpBar').style.width = pct(ev.xp.current, ev.xp.max) + '%';

    $('#achievementGrid').innerHTML = ev.achievements.map((a) =>
      `<div class="achievement ${a.unlocked ? '' : 'is-locked'}"><span class="achievement-ico">${a.icon}</span><span class="achievement-name">${a.name}</span></div>`
    ).join('');

    $('#xpFeed').innerHTML = ev.xp.feed.map((f) =>
      `<div class="xp-feed-row"><span>${f.label}</span><span class="xp-feed-amt">+${f.amt} XP</span></div>`
    ).join('') || `<p class="muted">Ainda sem atividade registrada.</p>`;
  }

  /* ---------------------------------------------------------
     RENDER: PROFILE
  --------------------------------------------------------- */
  function renderProfile() {
    if (!cache.user || !cache.profile) return;
    const p = cache.profile;
    $('#profileName').textContent = cache.user.name;
    const objMeta = OBJECTIVES.find((o) => o.id === p.objective);
    $('#profileObjective').textContent = 'Objetivo: ' + (objMeta ? objMeta.name : '');
    $('#pAge').value = p.age || '';
    $('#pHeight').value = p.heightCm || '';
    $('#pWeight').value = p.weightKg || '';
    $('#pActivity').value = p.activityLevel || 'Moderado';

    if (p.heightCm && p.weightKg) {
      const h = p.heightCm / 100;
      $('#pBmi').textContent = (p.weightKg / (h * h)).toFixed(1);
    } else {
      $('#pBmi').textContent = '—';
    }

    const initials = cache.user.name.split(' ').slice(0, 2).map((n) => n[0]).join('').toUpperCase();
    $('.avatar').textContent = initials;
  }

  $('#btnSaveProfile').addEventListener('click', async () => {
    try {
      const { profile } = await api.updateProfile({
        age: Number($('#pAge').value) || undefined,
        heightCm: Number($('#pHeight').value) || undefined,
        weightKg: Number($('#pWeight').value) || undefined,
        activityLevel: $('#pActivity').value,
      });
      cache.profile = profile;
      renderProfile();
      toast('Perfil atualizado!');
      const evolution = await api.getEvolution();
      cache.evolution = evolution;
      renderDashboard(); renderEvolution();
    } catch (err) { toast(friendlyError(err)); }
  });

  /* ---------------------------------------------------------
     SUBSCRIPTION (Asaas)
  --------------------------------------------------------- */
  const PLAN_LABELS = { pro_monthly: 'DayFIT PRO (mensal)', pro_annual: 'DayFIT PRO (anual)' };
  const STATUS_LABELS = {
    inactive: 'Sem assinatura ativa — você está no plano Free',
    pending: 'Pagamento pendente — finalize para ativar o PRO',
    active: 'Assinatura PRO ativa ✅',
    overdue: 'Pagamento atrasado — regularize para manter o PRO',
    canceled: 'Assinatura cancelada',
  };

  function renderBilling() {
    if (!cache.billing) { $('#billingStatusPanel').hidden = true; return; }
    const sub = cache.billing;
    $('#billingStatusPanel').hidden = false;
    const planLabel = sub.plan === 'free' ? 'Plano Free' : (PLAN_LABELS[sub.plan] || sub.plan);
    $('#billingStatusValue').textContent = `${planLabel} — ${STATUS_LABELS[sub.status] || sub.status}`;
  }

  $('#btnRefreshBilling').addEventListener('click', async () => {
    try {
      const { subscription } = await api.getBillingStatus();
      cache.billing = subscription;
      renderBilling();
      toast('Status atualizado.');
    } catch (err) { toast(friendlyError(err)); }
  });

  function openCheckout(plan, priceLabel) {
    openModal(`
      <div class="modal-head"><h2>Assinar ${PLAN_LABELS[plan]}</h2><button class="modal-close" data-close>✕</button></div>
      <p class="muted" style="margin-bottom:18px;">Valor: <strong style="color:var(--green-soft)">${priceLabel}</strong></p>
      <button class="btn btn--primary" id="btnStartCheckout" style="width:100%">Ir para o checkout</button>
      <p class="disclaimer">Você será redirecionado para uma página segura da Kiwify para concluir o pagamento (PIX, boleto ou cartão).</p>
    `);
    $('[data-close]').addEventListener('click', closeModal);
    $('#btnStartCheckout').addEventListener('click', async () => {
      const btn = $('#btnStartCheckout');
      btn.disabled = true; btn.textContent = 'Preparando checkout…';
      try {
        const result = await api.subscribe(plan);
        openModal(`
          <div class="modal-head"><h2>Falta pouco! 🎉</h2><button class="modal-close" data-close>✕</button></div>
          <p class="muted" style="margin-bottom:18px;">Conclua o pagamento na página da Kiwify — assim que for confirmado, seu plano PRO é ativado automaticamente.</p>
          ${result.checkoutUrl ? `<button class="btn btn--primary" id="btnOpenInvoice" style="width:100%; margin-bottom:10px;">Abrir checkout ↗</button>` : ''}
          <button class="btn btn--ghost" id="btnCheckPayment" style="width:100%">Já paguei, verificar status</button>
        `);
        $('[data-close]').addEventListener('click', closeModal);
        if (result.checkoutUrl) {
          $('#btnOpenInvoice').addEventListener('click', () => window.open(result.checkoutUrl, '_blank'));
        }
        $('#btnCheckPayment').addEventListener('click', async () => {
          const { subscription } = await api.getBillingStatus();
          cache.billing = subscription;
          renderBilling();
          closeModal();
          toast(subscription.status === 'active' ? 'Assinatura ativa! Bem-vindo ao PRO 🎉' : 'Ainda não identificamos o pagamento. Tente novamente em instantes.');
        });
      } catch (err) {
        toast(friendlyError(err));
        closeModal();
      }
    });
  }
  $('#btnSubscribePro').addEventListener('click', () => openCheckout('pro_monthly', 'R$13/mês'));
  $('#btnSubscribeAnnual').addEventListener('click', () => openCheckout('pro_annual', 'R$130/ano'));

  /* ---------------------------------------------------------
     QUICK ACTIONS
  --------------------------------------------------------- */
  $('#qaAnalyze').addEventListener('click', openPlateAnalysis);
  $('#btnAnalyzePlate').addEventListener('click', openPlateAnalysis);
  $('#qaMeal').addEventListener('click', () => { showView('nutrition'); openAddFoodModal(); });
  $('#btnAddFood').addEventListener('click', openAddFoodModal);
  $('#qaWorkout').addEventListener('click', () => { const w = getTodayWorkout(); if (w) startWorkoutSession(w.code); });
  $('#btnStartTodayWorkout').addEventListener('click', () => { const w = getTodayWorkout(); if (w) startWorkoutSession(w.code); });

  $('#qaWater').addEventListener('click', () => {
    openModal(`
      <div class="modal-head"><h2>💧 Registrar água</h2><button class="modal-close" data-close>✕</button></div>
      <p class="muted" style="margin-bottom:14px">Quanto você bebeu?</p>
      <div class="qty-row">
        <button class="qty-btn" data-water="0.2">+200ml</button>
        <button class="qty-btn" data-water="0.3">+300ml</button>
        <button class="qty-btn" data-water="0.5">+500ml</button>
        <button class="qty-btn" data-water="1">+1L</button>
      </div>
    `);
    $('[data-close]').addEventListener('click', closeModal);
    $$('[data-water]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        try {
          await api.addWater(parseFloat(btn.dataset.water));
          const [waterToday, evolution] = await Promise.all([api.getWaterToday(), api.getEvolution()]);
          cache.waterLiters = waterToday.totalLiters;
          cache.evolution = evolution;
          renderDashboard(); renderEvolution();
          closeModal();
          toast('Água registrada! 💧');
        } catch (err) { toast(friendlyError(err)); }
      });
    });
  });

  $('#qaWeight').addEventListener('click', () => {
    openModal(`
      <div class="modal-head"><h2>⚖️ Registrar peso</h2><button class="modal-close" data-close>✕</button></div>
      <div class="field-row"><label>Peso atual (kg)</label><input type="number" step="0.1" id="newWeightInput" value="${(cache.profile && cache.profile.weightKg) || ''}"></div>
      <button class="btn btn--primary" id="btnSaveWeight" style="width:100%">Salvar peso</button>
    `);
    $('[data-close]').addEventListener('click', closeModal);
    $('#btnSaveWeight').addEventListener('click', async () => {
      const val = parseFloat($('#newWeightInput').value);
      if (!val) return toast('Informe um peso válido.');
      try {
        await api.addWeight(val);
        const [profileRes, evolution] = await Promise.all([api.getProfile(), api.getEvolution()]);
        cache.profile = profileRes.profile;
        cache.evolution = evolution;
        renderAll();
        closeModal();
        toast('Peso registrado! ⚖️');
      } catch (err) { toast(friendlyError(err)); }
    });
  });

  $('#fabQuickAction').addEventListener('click', () => {
    openModal(`
      <div class="modal-head"><h2>Ação rápida</h2><button class="modal-close" data-close>✕</button></div>
      <div class="quick-grid" style="grid-template-columns:repeat(2,1fr)">
        <button class="quick-btn" data-fab="analyze"><span>📸</span>Analisar prato</button>
        <button class="quick-btn" data-fab="meal"><span>🍽️</span>Registrar refeição</button>
        <button class="quick-btn" data-fab="workout"><span>🏋️</span>Começar treino</button>
        <button class="quick-btn" data-fab="water"><span>💧</span>Registrar água</button>
      </div>
    `);
    $('[data-close]').addEventListener('click', closeModal);
    $$('[data-fab]').forEach((btn) => {
      btn.addEventListener('click', () => {
        closeModal();
        if (btn.dataset.fab === 'analyze') openPlateAnalysis();
        if (btn.dataset.fab === 'meal') { showView('nutrition'); openAddFoodModal(); }
        if (btn.dataset.fab === 'workout') { const w = getTodayWorkout(); if (w) startWorkoutSession(w.code); }
        if (btn.dataset.fab === 'water') $('#qaWater').click();
      });
    });
  });

  /* ---------------------------------------------------------
     CHARTS (canvas, sem libs externas)
  --------------------------------------------------------- */
  function getCssVar(name) { return getComputedStyle(document.documentElement).getPropertyValue(name).trim(); }

  function prepCanvas(canvas) {
    const ratio = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    const width = rect.width || canvas.parentElement.clientWidth;
    const height = canvas.height ? parseInt(canvas.getAttribute('height')) : 160;
    canvas.width = width * ratio;
    canvas.height = height * ratio;
    canvas.style.width = width + 'px';
    canvas.style.height = height + 'px';
    const ctx = canvas.getContext('2d');
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    return { ctx, width, height };
  }

  function drawLineChart(canvas, data, opts = {}) {
    if (!canvas) return;
    const { ctx, width, height } = prepCanvas(canvas);
    ctx.clearRect(0, 0, width, height);

    if (!data || data.length === 0) {
      ctx.fillStyle = getCssVar('--text-faint') || '#6E7266';
      ctx.font = '12.5px Manrope, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Registre seu peso para ver o gráfico', width / 2, height / 2);
      ctx.textAlign = 'left';
      return;
    }

    const pad = { top: 14, right: 10, bottom: opts.compact ? 14 : 24, left: opts.compact ? 10 : 36 };
    const min = Math.min(...data), max = Math.max(...data);
    const range = (max - min) || 1;
    const plotW = width - pad.left - pad.right;
    const plotH = height - pad.top - pad.bottom;
    const green = getCssVar('--green') || '#59D97F';
    const border = getCssVar('--border-soft') || '#1E211A';

    if (data.length === 1) {
      const cx = pad.left + plotW / 2, cy = pad.top + plotH / 2;
      ctx.beginPath(); ctx.arc(cx, cy, 5, 0, Math.PI * 2); ctx.fillStyle = green; ctx.fill();
      if (!opts.compact) {
        ctx.fillStyle = getCssVar('--text-dim') || '#A8AC9F';
        ctx.font = '12px Manrope, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(fmt1v(data[0]) + ' kg', cx, cy - 14);
        ctx.textAlign = 'left';
      }
      return;
    }

    if (!opts.compact) {
      ctx.strokeStyle = border; ctx.lineWidth = 1;
      for (let i = 0; i <= 3; i++) {
        const y = pad.top + (plotH / 3) * i;
        ctx.beginPath(); ctx.moveTo(pad.left, y); ctx.lineTo(width - pad.right, y); ctx.stroke();
      }
    }

    const points = data.map((v, i) => ({
      x: pad.left + (plotW * (i / (data.length - 1))),
      y: pad.top + plotH - ((v - min) / range) * plotH,
    }));

    const grad = ctx.createLinearGradient(0, pad.top, 0, pad.top + plotH);
    grad.addColorStop(0, 'rgba(89,217,127,0.28)');
    grad.addColorStop(1, 'rgba(89,217,127,0.0)');
    ctx.beginPath();
    ctx.moveTo(points[0].x, pad.top + plotH);
    points.forEach((p) => ctx.lineTo(p.x, p.y));
    ctx.lineTo(points[points.length - 1].x, pad.top + plotH);
    ctx.closePath();
    ctx.fillStyle = grad;
    ctx.fill();

    ctx.beginPath();
    points.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
    ctx.strokeStyle = green;
    ctx.lineWidth = 2.4;
    ctx.lineJoin = 'round';
    ctx.stroke();

    const last = points[points.length - 1];
    ctx.beginPath();
    ctx.arc(last.x, last.y, 4, 0, Math.PI * 2);
    ctx.fillStyle = green;
    ctx.fill();

    if (!opts.compact) {
      ctx.fillStyle = getCssVar('--text-faint') || '#6E7266';
      ctx.font = '11px Manrope, sans-serif';
      ctx.fillText(fmt1v(max) + ' kg', 2, pad.top + 4);
      ctx.fillText(fmt1v(min) + ' kg', 2, pad.top + plotH);
    }
  }
  function fmt1v(n) { return n.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }); }

  function drawBarChart(canvas, data, labels) {
    if (!canvas) return;
    const { ctx, width, height } = prepCanvas(canvas);
    ctx.clearRect(0, 0, width, height);
    const safeData = (data && data.length) ? data : labels.map(() => 0);
    const pad = { top: 14, right: 10, bottom: 26, left: 10 };
    const max = Math.max(...safeData, 1) * 1.15;
    const plotW = width - pad.left - pad.right;
    const plotH = height - pad.top - pad.bottom;
    const gap = 10;
    const barW = (plotW - gap * (safeData.length - 1)) / safeData.length;

    const green = getCssVar('--green-deep') || '#34A85A';
    const greenLight = getCssVar('--green') || '#59D97F';
    const textFaint = getCssVar('--text-faint') || '#6E7266';

    safeData.forEach((v, i) => {
      const barH = (v / max) * plotH;
      const x = pad.left + i * (barW + gap);
      const y = pad.top + plotH - barH;
      const grad = ctx.createLinearGradient(0, y, 0, y + barH);
      grad.addColorStop(0, greenLight);
      grad.addColorStop(1, green);
      ctx.fillStyle = grad;
      roundRect(ctx, x, y, barW, Math.max(barH, 1), 6);
      ctx.fill();
      ctx.fillStyle = textFaint;
      ctx.font = '10.5px Manrope, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(labels[i] || '', x + barW / 2, height - 8);
    });
    ctx.textAlign = 'left';
  }

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  /* ---------------------------------------------------------
     MASTER RENDER
  --------------------------------------------------------- */
  function renderAll() {
    renderGreeting();
    renderDashboard();
    renderNutrition();
    renderWorkouts();
    renderCalendar();
    renderGoals();
    renderEvolution();
    renderProfile();
    renderBilling();
  }

  let searchDebounce = null;
  $('#foodSearchInput').addEventListener('input', (e) => {
    clearTimeout(searchDebounce);
    const q = e.target.value;
    searchDebounce = setTimeout(() => refreshFoodLibrary(q), 250);
  });

  /* ---------------------------------------------------------
     INIT
  --------------------------------------------------------- */
  setupSubtabs();
  checkAuthOnLoad();

  window.addEventListener('resize', () => {
    if (!cache.evolution) return;
    drawLineChart($('#weightChartMini'), cache.evolution.weightSeries, { compact: true });
    if ($('#view-evolution').classList.contains('is-active')) {
      drawLineChart($('#weightChartFull'), cache.evolution.weightSeries, {});
      drawBarChart($('#calChart'), cache.evolution.caloriesWeek, cache.evolution.caloriesWeekLabels || []);
      drawBarChart($('#workoutChart'), cache.evolution.workoutsPerWeekSeries, ['Sem 1', 'Sem 2', 'Sem 3', 'Sem 4']);
    }
  });

})();
