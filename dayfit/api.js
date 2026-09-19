/* =========================================================
   DayFIT — api.js
   Cliente de API para falar com o backend (Node/Express).
   Troque API_BASE se hospedar o backend em outro endereço.
   ========================================================= */

const DayFitAPI = (function () {
  "use strict";

  const API_BASE = window.DAYFIT_API_BASE || 'http://localhost:4000/api';
  const TOKEN_KEY = 'dayfit_token';

  function getToken() { return localStorage.getItem(TOKEN_KEY); }
  function setToken(token) {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  }

  async function request(path, { method = 'GET', body, auth = true } = {}) {
    const headers = { 'Content-Type': 'application/json' };
    if (auth) {
      const token = getToken();
      if (token) headers.Authorization = 'Bearer ' + token;
    }

    let res;
    try {
      res = await fetch(API_BASE + path, {
        method,
        headers,
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
    } catch (networkErr) {
      const err = new Error('Não foi possível conectar ao servidor do DayFIT. Verifique se o backend está rodando.');
      err.isNetworkError = true;
      throw err;
    }

    let data = null;
    try { data = await res.json(); } catch (e) { /* resposta sem corpo JSON */ }

    if (!res.ok) {
      const err = new Error((data && data.error) || `Erro ${res.status} na requisição.`);
      err.status = res.status;
      err.data = data;
      throw err;
    }
    return data;
  }

  return {
    getToken, setToken,

    // Auth
    register: (name, email, password) => request('/auth/register', { method: 'POST', body: { name, email, password }, auth: false }),
    login: (email, password) => request('/auth/login', { method: 'POST', body: { email, password }, auth: false }),
    me: () => request('/auth/me'),

    // Profile & goals
    getProfile: () => request('/profile'),
    updateProfile: (data) => request('/profile', { method: 'PUT', body: data }),
    setObjective: (objective) => request('/profile/objective', { method: 'PUT', body: { objective } }),
    getGoals: () => request('/goals'),
    updateGoals: (data) => request('/goals', { method: 'PUT', body: data }),

    // Catalog
    getFoods: (params = {}) => request('/foods?' + new URLSearchParams(params).toString()),
    getRecipes: (params = {}) => request('/recipes?' + new URLSearchParams(params).toString()),

    // Diary
    getDiaryToday: () => request('/diary/today'),
    addDiaryManual: (data) => request('/diary', { method: 'POST', body: data }),
    addDiaryFromFood: (foodId, meal) => request('/diary/from-food', { method: 'POST', body: { foodId, meal } }),
    addDiaryFromRecipe: (recipeId, meal) => request('/diary/from-recipe', { method: 'POST', body: { recipeId, meal } }),
    analyzePlate: (meal) => request('/diary/plate-analysis', { method: 'POST', body: { meal } }),
    confirmPlateAnalysis: (data) => request('/diary/plate-analysis/confirm', { method: 'POST', body: data }),
    addWater: (liters) => request('/diary/water', { method: 'POST', body: { liters } }),
    getWaterToday: () => request('/diary/water/today'),

    // Weight
    addWeight: (weightKg) => request('/weight', { method: 'POST', body: { weightKg } }),
    getWeightHistory: (days = 30) => request('/weight/history?days=' + days),

    // Workouts
    getWorkouts: () => request('/workouts'),
    createWorkout: (data) => request('/workouts', { method: 'POST', body: data }),
    setExerciseProgress: (code, exerciseIndex, completed) =>
      request(`/workouts/${code}/progress`, { method: 'POST', body: { exerciseIndex, completed } }),
    finishWorkoutSession: (workoutCode, durationMin) =>
      request('/workouts/sessions', { method: 'POST', body: { workoutCode, durationMin } }),
    getWorkoutCalendar: (year, month) => request(`/workouts/sessions/calendar?year=${year}&month=${month}`),

    // Evolution / gamification
    getEvolution: () => request('/evolution'),

    // Billing (Kiwify)
    subscribe: (plan) => request('/billing/subscribe', { method: 'POST', body: { plan } }),
    getBillingStatus: () => request('/billing/status'),
    cancelSubscription: () => request('/billing/cancel', { method: 'POST' }),

    // Criação personalizada (treino / dieta / receita)
    generateWorkoutPlan: () => request('/plans/workout', { method: 'POST' }),
    generateDietPlan: () => request('/plans/diet', { method: 'POST' }),
    getLatestDietPlan: () => request('/plans/diet/latest'),
    createDietManual: (data) => request('/plans/diet/manual', { method: 'POST', body: data }),
    generateRecipe: (preference) => request('/plans/recipe', { method: 'POST', body: { preference } }),
    createRecipe: (data) => request('/recipes', { method: 'POST', body: data }),
  };
})();
