// ==================== CONFIGURACIÓN DE SUPABASE ====================
const SUPABASE_URL = 'https://rymtixdqswlxvmtjbkiw.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_gS1AcjFnUXrkvs7zSJS6CA_13c3NwDk';

// Inicialización segura con el SDK global de Supabase
const { createClient } = supabase;
const supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ==================== ESTADO GLOBAL DE LA APP ====================
let currentUser = null;
let currentProfile = null;

// ==================== INICIALIZACIÓN ====================
document.addEventListener('DOMContentLoaded', async () => {
    // Inicializar iconos de Lucide
    if (typeof lucide !== 'undefined') {
        lucide.createIcons();
    }

    // Comprobar si ya existe una sesión activa al cargar
    await checkSession();
});

// ==================== CONTROL DE PESTAÑAS (LOGIN / REGISTRO) ====================
function switchAuthTab(tab) {
    const tabLogin = document.getElementById('tab-login');
    const tabRegister = document.getElementById('tab-register');
    const formLogin = document.getElementById('form-login');
    const formRegister = document.getElementById('form-register');

    if (tab === 'login') {
        tabLogin.className = 'flex-1 py-2.5 text-sm font-semibold rounded-xl transition-all bg-brand-600 text-white shadow-lg shadow-brand-600/30';
        tabRegister.className = 'flex-1 py-2.5 text-sm font-semibold rounded-xl transition-all text-slate-400 hover:text-white';
        formLogin.classList.remove('hidden');
        formRegister.classList.add('hidden');
    } else {
        tabRegister.className = 'flex-1 py-2.5 text-sm font-semibold rounded-xl transition-all bg-brand-600 text-white shadow-lg shadow-brand-600/30';
        tabLogin.className = 'flex-1 py-2.5 text-sm font-semibold rounded-xl transition-all text-slate-400 hover:text-white';
        formRegister.classList.remove('hidden');
        formLogin.classList.add('hidden');
    }
}

// ==================== GESTIÓN DE SESIÓN ====================
async function checkSession() {
    try {
        const { data: { session }, error } = await supabaseClient.auth.getSession();
        if (error) throw error;

        if (session && session.user) {
            currentUser = session.user;
            await fetchUserProfile(currentUser.id);
            hideAuthModal();
            renderAppUI();
        } else {
            showAuthModal();
        }
    } catch (err) {
        console.error('Error al verificar la sesión:', err.message);
        showAuthModal();
    }
}

async function fetchUserProfile(userId) {
    try {
        const { data, error } = await supabaseClient
            .from('perfiles')
            .select('*')
            .eq('id', userId)
            .single();

        if (error) {
            console.error('No se pudo cargar el perfil del canino:', error.message);
        } else {
            currentProfile = data;
        }
    } catch (err) {
        console.error('Excepción al buscar perfil:', err);
    }
}

// ==================== AUTENTICACIÓN: REGISTRO ====================
async function handleRegister(event) {
    event.preventDefault();

    const nombrePerro = document.getElementById('reg-nombre').value.trim();
    const username = document.getElementById('reg-username').value.trim();
    const raza = document.getElementById('reg-raza').value.trim();
    const email = document.getElementById('reg-email').value.trim();
    const password = document.getElementById('reg-password').value.trim();

    try {
        // Registrar usuario en Supabase Auth y pasar metadatos para el trigger SQL
        const { data, error } = await supabaseClient.auth.signUp({
            email: email,
            password: password,
            options: {
                data: {
                    nombre_perro: nombrePerro,
                    username: username,
                    raza: raza
                }
            }
        });

        if (error) throw error;

        alert('¡Registro exitoso! Revisa tu correo si Supabase requiere confirmación, o inicia sesión.');
        switchAuthTab('login');
    } catch (err) {
        alert('Error en el registro: ' + err.message);
        console.error(err);
    }
}

// ==================== AUTENTICACIÓN: LOGIN ====================
async function handleLogin(event) {
    event.preventDefault();

    const email = document.getElementById('login-email').value.trim();
    const password = document.getElementById('login-password').value.trim();

    try {
        const { data, error } = await supabaseClient.auth.signInWithPassword({
            email: email,
            password: password
        });

        if (error) throw error;

        currentUser = data.user;
        await fetchUserProfile(currentUser.id);
        
        hideAuthModal();
        renderAppUI();
    } catch (err) {
        alert('Error al iniciar sesión: ' + err.message);
        console.error(err);
    }
}

// ==================== CERRAR SESIÓN ====================
async function handleLogout() {
    try {
        await supabaseClient.auth.signOut();
        currentUser = null;
        currentProfile = null;
        showAuthModal();
    } catch (err) {
        console.error('Error al cerrar sesión:', err);
    }
}

// ==================== CONTROL DE MODAL E INTERFAZ ====================
function showAuthModal() {
    const modal = document.getElementById('auth-screen');
    if (modal) modal.classList.remove('hidden');
}

function hideAuthModal() {
    const modal = document.getElementById('auth-screen');
    if (modal) modal.classList.add('hidden');
}

function renderAppUI() {
    const appContainer = document.getElementById('app');
    if (!appContainer) return;

    const dogName = currentProfile ? currentProfile.nombre_perro : 'Perrito';
    const dogUsername = currentProfile ? currentProfile.username : '@usuario';
    const dogBreed = currentProfile ? currentProfile.raza : 'Mestizo';
    const avatarUrl = currentProfile ? currentProfile.avatar_url : 'https://images.unsplash.com/photo-1543466835-00a7907e9de1?w=300&auto=format&fit=crop&q=80';

    // Interfaz base del muro principal tras iniciar sesión
    appContainer.innerHTML = `
        <header class="w-full bg-slate-900/80 border-b border-slate-800 p-4 flex justify-between items-center sticky top-0 z-40 backdrop-blur-md">
            <div class="flex items-center space-x-3">
                <img src="${avatarUrl}" alt="Avatar" class="w-10 h-10 rounded-full object-cover border-2 border-brand-500">
                <div>
                    <h2 class="text-white font-bold text-sm">${dogName}</h2>
                    <span class="text-xs text-mint-400">${dogUsername} (${dogBreed})</span>
                </div>
            </div>
            <button onclick="handleLogout()" class="bg-slate-800 hover:bg-slate-700 text-slate-300 px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors flex items-center space-x-1">
                <i data-lucide="log-out" class="w-3.5 h-3.5"></i>
                <span>Salir</span>
            </button>
        </header>

        <main class="flex-1 max-w-xl w-full mx-auto p-4 flex flex-col space-y-6">
            <div class="bg-slate-900/60 border border-slate-800 rounded-3xl p-6 text-center shadow-xl">
                <h3 class="text-xl font-bold text-white mb-2">¡Bienvenido a Fotodog, ${dogName}!</h3>
                <p class="text-slate-400 text-sm mb-4">Tu red social canina está lista para que compartas tu foto del día.</p>
                <div class="p-4 bg-brand-500/10 rounded-2xl border border-brand-500/20 text-brand-300 text-sm">
                    Regla de oro: Solo una publicación fotográfica al día por perrito 🐾
                </div>
            </div>
        </main>
    `;

    if (typeof lucide !== 'undefined') {
        lucide.createIcons();
    }
}
