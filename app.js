// ==================== CONFIGURACIÓN DE SUPABASE ====================
const SUPABASE_URL = 'https://rymtixdqswlxvmtjbkiw.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_gS1AcjFnUXrkvs7zSJS6CA_13c3NwDk';

// Forma segura de inicializar si usas el CDN de Supabase en el HTML
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const { createClient } = supabase;
const supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let currentSessionUser = null;
let currentProfile = null;
let selectedImageFile = null;

document.addEventListener('DOMContentLoaded', async () => {
  lucide.createIcons();
  await checkSession();
  await loadFeedFromSupabase();
});

// Devuelve la fecha local actual para controlar el límite diario
function fechaLocalHoy() {
  const ahora = new Date();
  const offset = ahora.getTimezoneOffset();
  const fechaLocal = new Date(ahora.getTime() - offset * 60 * 1000);
  return fechaLocal.toISOString().split('T')[0];
}

// ==================== SESIÓN ====================
async function checkSession() {
  const { data, error } = await supabaseClient.auth.getSession();

  if (error) {
    console.error('Error al obtener la sesión:', error);
    document.getElementById('auth-screen').classList.remove('hidden');
    return;
  }

  const session = data.session;

  if (session) {
    currentSessionUser = session.user;
    await fetchProfile(currentSessionUser.id);
    document.getElementById('auth-screen').classList.add('hidden');
    switchTab('muro');
  } else {
    currentSessionUser = null;
    currentProfile = null;
    document.getElementById('auth-screen').classList.remove('hidden');
  }
}

async function fetchProfile(userId) {
  const { data: perfil, error } = await supabaseClient
    .from('perfiles')
    .select('*')
    .eq('id', userId)
    .single();

  if (error) {
    console.error('Error al cargar perfil:', error);
    return;
  }

  currentProfile = perfil;
  const hoy = fechaLocalHoy();

  const { count } = await supabaseClient
    .from('publicaciones')
    .select('*', { count: 'exact', head: true })
    .eq('usuario_id', userId)
    .eq('fecha', hoy);

  currentProfile.dailyPhotosCount = count || 0;
  updateProfileUI();
}

// ==================== LOGIN ====================
async function handleLogin(e) {
  e.preventDefault();

  const inputs = e.target.querySelectorAll('input');
  const email = inputs[0].value.trim();
  const password = inputs[1].value.trim();

  const { data, error } = await supabaseClient.auth.signInWithPassword({
    email,
    password
  });

  if (error) {
    alert('Error al iniciar sesión: ' + error.message);
    return;
  }

  currentSessionUser = data.user;
  await fetchProfile(currentSessionUser.id);

  document.getElementById('auth-screen').classList.add('hidden');
  switchTab('muro');
}

// ==================== REGISTRO AUTOMÁTICO ====================
async function handleRegister(e) {
  e.preventDefault();

  const dogName = document.getElementById('reg-dog-name').value.trim();
  const usernameInput = document.getElementById('reg-username').value.trim();
  const breed = document.getElementById('reg-breed').value.trim();
  const email = document.getElementById('reg-email').value.trim();
  const password = document.getElementById('reg-password').value.trim();

  if (!dogName || !usernameInput || !breed || !email || !password) {
    alert('Por favor completa todos los campos.');
    return;
  }

  const username = usernameInput.startsWith('@')
    ? usernameInput
    : '@' + usernameInput;

  // El Trigger en Supabase intercepta esto y crea el perfil en la tabla 'perfiles' automáticamente
  const { data: authData, error: authError } = await supabaseClient.auth.signUp({
    email,
    password,
    options: {
      data: {
        nombre_perro: dogName,
        username: username,
        raza: breed
      }
    }
  });

  if (authError) {
    alert('Error en el registro: ' + authError.message);
    return;
  }

  alert('¡Perrito registrado con éxito! Ya puedes iniciar sesión.');
  switchAuthTab('login');
}

// ==================== LOGOUT ====================
async function logout() {
  await supabaseClient.auth.signOut();

  currentSessionUser = null;
  currentProfile = null;
  selectedImageFile = null;

  document.getElementById('auth-screen').classList.remove('hidden');
  switchAuthTab('login');
}

// ==================== FOTO DIARIA ====================
function previewSelectedImage(event) {
  const file = event.target.files[0];
  if (!file) return;

  if (!file.type.startsWith('image/')) {
    alert('Por favor selecciona un archivo de imagen válido.');
    event.target.value = '';
    return;
  }

  selectedImageFile = file;
}

async function uploadDailyPhoto() {
  if (!currentSessionUser || !currentProfile) {
    alert('Debes iniciar sesión para publicar una foto.');
    document.getElementById('auth-screen').classList.remove('hidden');
    return;
  }

  if (currentProfile.dailyPhotosCount >= 2) {
    alert('¡Has alcanzado el límite de 2 fotos para el día de hoy!');
    return;
  }

  if (!selectedImageFile) {
    alert('Por favor selecciona una imagen primero.');
    return;
  }

  const caption =
    document.getElementById('photo-caption').value.trim() ||
    '¡Momento del día!';

  const fileExt = selectedImageFile.name.split('.').pop();
  const fileName = `${currentProfile.id}_${Date.now()}.${fileExt}`;
  const filePath = `muro/${fileName}`;

  const { error: uploadError } = await supabaseClient.storage
    .from('fotodog-fotos')
    .upload(filePath, selectedImageFile);

  if (uploadError) {
    alert('Error al subir imagen: ' + uploadError.message);
    return;
  }

  const { data } = supabaseClient.storage
    .from('fotodog-fotos')
    .getPublicUrl(filePath);

  const publicUrl = data.publicUrl;
  const hoy = fechaLocalHoy();

  const { error: dbError } = await supabaseClient
    .from('publicaciones')
    .insert([
      {
        usuario_id: currentProfile.id,
        foto_url: publicUrl,
        comentario: caption,
        fecha: hoy
      }
    ]);

  if (dbError) {
    alert('Error al guardar publicación: ' + dbError.message);
    return;
  }

  alert('¡Foto publicada con éxito!');

  document.getElementById('photo-caption').value = '';
  document.getElementById('photo-input').value = '';
  selectedImageFile = null;

  await fetchProfile(currentProfile.id);
  await loadFeedFromSupabase();
  switchTab('muro');
}

// ==================== MURO ====================
async function loadFeedFromSupabase() {
  const { data: posts, error } = await supabaseClient
    .from('publicaciones')
    .select(
      `
      id,
      foto_url,
      comentario,
      creado_el,
      perfiles (
        nombre_perro,
        username,
        raza,
        avatar_url
      )
    `
    )
    .order('creado_el', { ascending: false });

  if (error) {
    console.error('Error cargando feed:', error);
    return;
  }

  const feedContainer = document.getElementById('muro-feed');
  feedContainer.innerHTML = '';

  if (!posts || posts.length === 0) {
    feedContainer.innerHTML = `
      <div class="bg-slate-900/80 border border-brand-500/20 rounded-3xl p-8 text-center">
        <p class="text-slate-300 font-bold">Todavía no hay fotos publicadas.</p>
        <p class="text-slate-500 text-sm mt-1">¡Sé el primero en compartir un momento!</p>
      </div>
    `;
    return;
  }

  posts.forEach(post => {
    if (!post.perfiles) return;

    const avatar =
      post.perfiles.avatar_url ||
      'https://images.unsplash.com/photo-1543466835-00a7907e9de1?w=150&auto=format&fit=crop&q=80';

    const postHtml = `
      <article class="bg-slate-900/80 backdrop-blur-xl rounded-3xl border border-brand-500/20 shadow-2xl overflow-hidden animate-fade-in">
        <div class="p-4 flex items-center justify-between bg-slate-950/40">
          <div class="flex items-center gap-3">
            <img src="${avatar}" alt="${post.perfiles.nombre_perro}" class="w-11 h-11 rounded-full object-cover ring-2 ring-brand-500">
            <div>
              <h3 class="text-sm font-black text-white leading-tight">${post.perfiles.nombre_perro}</h3>
              <p class="text-xs text-brand-300 font-semibold">${post.perfiles.username} • ${post.perfiles.raza}</p>
            </div>
          </div>
        </div>
        <div class="relative aspect-square bg-slate-950">
          <img src="${post.foto_url}" alt="Foto de ${post.perfiles.nombre_perro}" class="w-full h-full object-cover">
        </div>
        <div class="p-5 space-y-3">
          <p class="text-sm text-slate-200 font-medium leading-relaxed">
            <strong class="text-mint-400">${post.perfiles.username}:</strong> ${post.comentario || ''}
          </p>
        </div>
      </article>
    `;

    feedContainer.insertAdjacentHTML('beforeend', postHtml);
  });

  lucide.createIcons();
}

// ==================== PERFIL ====================
function updateProfileUI() {
  if (!currentProfile) return;

  const avatar =
    currentProfile.avatar_url ||
    'https://images.unsplash.com/photo-1543466835-00a7907e9de1?w=300&auto=format&fit=crop&q=80';

  document.getElementById('user-dog-name').innerText = currentProfile.nombre_perro;
  document.getElementById('user-dog-username').innerText = currentProfile.username;
  document.getElementById('user-dog-breed').innerText = currentProfile.raza;
  document.getElementById('header-avatar').src = avatar;
  document.getElementById('header-username').innerText = currentProfile.username;
  document.getElementById('user-profile-img').src = avatar;
  document.getElementById('daily-count-num').innerText = currentProfile.dailyPhotosCount;

  const uploadBox = document.getElementById('upload-box');
  const blockedMsg = document.getElementById('upload-blocked-msg');

  if (currentProfile.dailyPhotosCount >= 2) {
    uploadBox.classList.add('hidden');
    blockedMsg.classList.remove('hidden');
  } else {
    uploadBox.classList.remove('hidden');
    blockedMsg.classList.add('hidden');
  }
}

// ==================== NAVEGACIÓN ====================
function switchTab(tabId) {
  if (tabId === 'profile' && !currentSessionUser) {
    document.getElementById('auth-screen').classList.remove('hidden');
    return;
  }

  const sections = ['muro', 'solteros', 'adopta', 'vetes', 'profile'];

  sections.forEach(sec => {
    const el = document.getElementById('sec-' + sec);
    const nav = document.getElementById('nav-' + sec);

    if (sec === tabId) {
      el.classList.remove('hidden');
      if (nav) {
        nav.className =
          'w-full flex items-center gap-3.5 px-4 py-3.5 rounded-2xl bg-gradient-to-r from-brand-600 to-indigo-600 text-white font-extrabold text-sm shadow-lg shadow-brand-600/30 transition';
      }
    } else {
      el.classList.add('hidden');
      if (nav) {
        nav.className =
          'w-full flex items-center gap-3.5 px-4 py-3.5 rounded-2xl text-slate-300 hover:bg-brand-500/10 hover:text-white font-bold text-sm transition';
      }
    }
  });
}

function switchAuthTab(type) {
  const tabLogin = document.getElementById('tab-login');
  const tabReg = document.getElementById('tab-register');
  const formLogin = document.getElementById('form-login');
  const formReg = document.getElementById('form-register');

  if (type === 'login') {
    tabLogin.className =
      'flex-1 py-2.5 rounded-xl bg-gradient-to-r from-brand-600 to-brand-500 text-white shadow-md transition';
    tabReg.className =
      'flex-1 py-2.5 rounded-xl text-slate-400 hover:text-white transition';
    formLogin.classList.remove('hidden');
    formReg.classList.add('hidden');
  } else {
    tabReg.className =
      'flex-1 py-2.5 rounded-xl bg-gradient-to-r from-brand-600 to-brand-500 text-white shadow-md transition';
    tabLogin.className =
      'flex-1 py-2.5 rounded-xl text-slate-400 hover:text-white transition';
    formReg.classList.remove('hidden');
    formLogin.classList.add('hidden');
  }
}

function guestAccess() {
  document.getElementById('auth-screen').classList.add('hidden');
  switchTab('muro');
}

function donateMercadoPago(monto) {
  alert(`Redirigiendo a MercadoPago por $${monto.toLocaleString('es-CL')} CLP...`);
}
