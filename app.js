// ==================== CONFIGURACIÓN DE SUPABASE ====================
const SUPABASE_URL = 'https://rymtixdqswlxvmtjbkiw.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_gS1AcjFnUXrkvs7zSJS6CA_13c3NwDk';

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

function fechaLocalHoy() {
    const ahora = new Date();
    const offset = ahora.getTimezoneOffset();
    const fechaLocal = new Date(ahora.getTime() - offset * 60 * 1000);
    return fechaLocal.toISOString().split('T')[0];
}

async function checkSession() {
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (session) {
        currentSessionUser = session.user;
        await fetchProfile(currentSessionUser.id);
        document.getElementById('auth-screen').classList.add('hidden');
    } else {
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

async function handleLogin(e) {
    e.preventDefault();
    const email = document.getElementById('login-email').value.trim();
    const password = document.getElementById('login-password').value.trim();

    const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });

    if (error) {
        alert('Error al iniciar sesión: ' + error.message);
        return;
    }

    currentSessionUser = data.user;
    await fetchProfile(currentSessionUser.id);
    document.getElementById('auth-screen').classList.add('hidden');
}

async function handleRegister(e) {
    e.preventDefault();
    
    const dogName = document.getElementById('reg-nombre').value.trim();
    const usernameInput = document.getElementById('reg-username').value.trim();
    const breed = document.getElementById('reg-raza').value.trim();
    const email = document.getElementById('reg-email').value.trim();
    const password = document.getElementById('reg-password').value.trim();

    const username = usernameInput.startsWith('@') ? usernameInput : '@' + usernameInput;

    const { data, error } = await supabaseClient.auth.signUp({ email, password });

    if (error) {
        alert('Error en el registro Auth: ' + error.message);
        return;
    }

    if (!data.user) {
        alert('No se pudo registrar el usuario.');
        return;
    }

    const userId = data.user.id;

    const { error: profileError } = await supabaseClient
        .from('perfiles')
        .insert([
            {
                id: userId,
                nombre_perro: dogName,
                username: username,
                raza: breed
            }
        ]);

    if (profileError) {
        alert('Error al guardar el perfil: ' + profileError.message);
        return;
    }

    alert('¡Registro exitoso! Ya puedes iniciar sesión.');
    switchAuthTab('login');
}

async function logout() {
    await supabaseClient.auth.signOut();
    currentSessionUser = null;
    currentProfile = null;
    selectedImageFile = null;
    document.getElementById('auth-screen').classList.remove('hidden');
}

function previewSelectedImage(event) {
    const file = event.target.files[0];
    if (file) selectedImageFile = file;
}

async function uploadDailyPhoto() {
    if (!currentProfile) return;

    if (currentProfile.dailyPhotosCount >= 2) {
        alert('¡Has alcanzado el límite de 2 fotos para el día de hoy!');
        return;
    }

    if (!selectedImageFile) {
        alert('Por favor selecciona una imagen primero.');
        return;
    }

    const caption = document.getElementById('photo-caption').value.trim() || '¡Momento del día!';
    const fileExt = selectedImageFile.name.split('.').pop();
    const fileName = `${currentProfile.id}_${Date.now()}.${fileExt}`;
    const filePath = `muro/${fileName}`;

    const { error: uploadError } = await supabaseClient.storage
        .from('fotodog-fotos')
        .upload(filePath, selectedImageFile);

    if (uploadError) {
        alert('Error al subir imagen al Storage: ' + uploadError.message);
        return;
    }

    const { data } = supabaseClient.storage
        .from('fotodog-fotos')
        .getPublicUrl(filePath);

    const hoy = fechaLocalHoy();
    const { error: dbError } = await supabaseClient
        .from('publicaciones')
        .insert([
            {
                usuario_id: currentProfile.id,
                foto_url: data.publicUrl,
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
    selectedImageFile = null;
    await fetchProfile(currentProfile.id);
    await loadFeedFromSupabase();
}

async function loadFeedFromSupabase() {
    const { data: posts, error } = await supabaseClient
        .from('publicaciones')
        .select(`
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
        `)
        .order('creado_el', { ascending: false });

    if (error) {
        console.error('Error cargando feed:', error);
        return;
    }

    const feedContainer = document.getElementById('muro-feed');
    feedContainer.innerHTML = '';

    if (!posts || posts.length === 0) {
        feedContainer.innerHTML = `<div class="bg-slate-900 p-6 rounded-3xl text-center text-slate-400 text-xs">No hay publicaciones todavía. ¡Sé el primero!</div>`;
        return;
    }

    posts.forEach(post => {
        if (!post.perfiles) return;
        const postHtml = `
            <article class="bg-slate-900 rounded-3xl border border-slate-800 overflow-hidden shadow-xl">
                <div class="p-4 flex items-center gap-3 bg-slate-950/50">
                    <img src="${post.perfiles.avatar_url}" class="w-10 h-10 rounded-full object-cover">
                    <div>
                        <h3 class="text-sm font-bold text-white">${post.perfiles.nombre_perro}</h3>
                        <p class="text-xs text-slate-400">${post.perfiles.username} • ${post.perfiles.raza}</p>
                    </div>
                </div>
                <div class="aspect-square bg-black">
                    <img src="${post.foto_url}" class="w-full h-full object-cover">
                </div>
                <div class="p-4 text-xs">
                    <strong class="text-mint-400">${post.perfiles.username}:</strong> ${post.comentario || ''}
                </div>
            </article>
        `;
        feedContainer.insertAdjacentHTML('beforeend', postHtml);
    });
    lucide.createIcons();
}

function updateProfileUI() {
    if (!currentProfile) return;
    document.getElementById('header-username').innerText = currentProfile.username;
    document.getElementById('daily-count-num').innerText = currentProfile.dailyPhotosCount;

    if (currentProfile.dailyPhotosCount >= 2) {
        document.getElementById('upload-box').classList.add('hidden');
        document.getElementById('upload-blocked-msg').classList.remove('hidden');
    } else {
        document.getElementById('upload-box').classList.remove('hidden');
        document.getElementById('upload-blocked-msg').classList.add('hidden');
    }
}

function switchAuthTab(type) {
    const tabLogin = document.getElementById('tab-login');
    const tabReg = document.getElementById('tab-register');
    const formLogin = document.getElementById('form-login');
    const formReg = document.getElementById('form-register');

    if (type === 'login') {
        tabLogin.className = "flex-1 py-2.5 text-sm font-semibold rounded-xl bg-brand-600 text-white shadow-lg transition-all";
        tabReg.className = "flex-1 py-2.5 text-sm font-semibold rounded-xl text-slate-400 hover:text-white transition-all";
        formLogin.classList.remove('hidden');
        formReg.classList.add('hidden');
    } else {
        tabReg.className = "flex-1 py-2.5 text-sm font-semibold rounded-xl bg-brand-600 text-white shadow-lg transition-all";
        tabLogin.className = "flex-1 py-2.5 text-sm font-semibold rounded-xl text-slate-400 hover:text-white transition-all";
        formReg.classList.remove('hidden');
        formLogin.classList.add('hidden');
    }
}
