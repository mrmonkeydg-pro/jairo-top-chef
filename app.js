import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
const SUPABASE_URL='https://cjaqwmoalqpoodgtneek.supabase.co';
const SUPABASE_KEY='sb_publishable_ZwRwqXXoZcKOg1-f8l4Zfw_3CmOx0ab';
const sb=createClient(SUPABASE_URL,SUPABASE_KEY);
const $=s=>document.querySelector(s), app=$('#app');
let state={session:null,profile:null,recipes:[],categories:[],ingredients:[],tags:[],view:'grid',section:'home',search:'',category:null};

function esc(v=''){return String(v).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]))}
function toast(msg){const t=$('#toast');t.textContent=msg;t.hidden=false;setTimeout(()=>t.hidden=true,2600)}
function icon(n){return {home:'⌂',recipes:'▤',menu:'◷',changes:'✓',settings:'⚙'}[n]||'•'}
function roleName(r){return {admin:'Administrador',collaborator:'Colaborador',viewer:'Usuario'}[r]||r}
function statusName(s){return {pending:'Pendiente',active:'Activo',rejected:'Rechazado',prepared:'Preparado',cooking:'Cocinando',finished:'Terminado'}[s]||s}

async function init(){
 const {data:{session}}=await sb.auth.getSession(); state.session=session;
 sb.auth.onAuthStateChange(async(_,s)=>{state.session=s;if(s)await loadProfile();else renderAuth()});
 if(!session)return renderAuth();
 await loadProfile();
}
async function loadProfile(){
 const uid=state.session?.user?.id;if(!uid)return renderAuth();
 let {data}=await sb.from('profiles').select('*').eq('id',uid).maybeSingle();
 if(!data){await new Promise(r=>setTimeout(r,500));({data}=await sb.from('profiles').select('*').eq('id',uid).maybeSingle())}
 state.profile=data;
 if(data?.status==='pending'){
   const {data:boot}=await sb.rpc('bootstrap_first_admin');
   if(boot){({data}=await sb.from('profiles').select('*').eq('id',uid).single());state.profile=data}
 }
 if(!state.profile||state.profile.status!=='active')return renderPending();
 await loadBase(); renderShell();
}
async function loadBase(){
 const [r,c,i,t]=await Promise.all([
  sb.from('recipes').select('*,categories(name),recipe_photos(*)').order('title'),
  sb.from('categories').select('*').order('name'),
  sb.from('ingredients').select('*').order('name'),
  sb.from('tags').select('*').order('name')
 ]);
 state.recipes=r.data||[];state.categories=c.data||[];state.ingredients=i.data||[];state.tags=t.data||[];
}
function renderAuth(){
 app.innerHTML=`<div class="auth-wrap"><div class="auth-card"><div class="brand-mark">J</div><h1>Jairo Top Chef</h1><p class="muted">Recetario profesional</p>
 <div class="tabs"><button class="active" data-auth-tab="login">Entrar</button><button data-auth-tab="signup">Crear cuenta</button></div>
 <form id="authForm"><input id="fullName" placeholder="Nombre completo" style="display:none"><input id="email" type="email" placeholder="Correo electrónico" required><input id="password" type="password" minlength="6" placeholder="Contraseña" required><button class="primary">Entrar</button></form>
 <p id="authNote" class="muted" style="font-size:13px">Las cuentas nuevas deben ser aprobadas por un administrador.</p></div></div>`;
 let mode='login';
 document.querySelectorAll('[data-auth-tab]').forEach(b=>b.onclick=()=>{mode=b.dataset.authTab;document.querySelectorAll('[data-auth-tab]').forEach(x=>x.classList.toggle('active',x===b));$('#fullName').style.display=mode==='signup'?'block':'none';$('#authForm button').textContent=mode==='signup'?'Solicitar acceso':'Entrar'});
 $('#authForm').onsubmit=async e=>{e.preventDefault();const email=$('#email').value,password=$('#password').value;
   if(mode==='signup'){const {error}=await sb.auth.signUp({email,password,options:{data:{full_name:$('#fullName').value.trim()}}});if(error)return toast(error.message);toast('Cuenta creada. Revisa tu correo si se solicita confirmación.')}
   else{const {error}=await sb.auth.signInWithPassword({email,password});if(error)toast('No se pudo iniciar sesión: '+error.message)}
 };
}
function renderPending(){
 app.innerHTML=`<div class="auth-wrap"><div class="auth-card"><div class="brand-mark">J</div><h1>Acceso pendiente</h1><p>Tu cuenta está esperando la aprobación de un administrador.</p><p class="muted">Cuando sea aprobada podrás consultar Jairo Top Chef.</p><button id="refresh" class="primary">Comprobar acceso</button><button id="logout" style="margin-top:8px">Cerrar sesión</button></div></div>`;
 $('#refresh').onclick=loadProfile;$('#logout').onclick=()=>sb.auth.signOut();
}
function nav(){
 const items=[['home','Inicio'],['recipes','Recetas'],['menu','Menú'],['changes',state.profile.role==='admin'?'Aprobar':'Cambios'],['settings','Ajustes']];
 return `<nav class="bottomnav">${items.map(([k,n])=>`<button data-nav="${k}" class="${state.section===k?'active':''}"><span>${icon(k)}</span>${n}</button>`).join('')}</nav>`;
}
function renderShell(){
 app.innerHTML=`<main class="shell"><header class="topbar"><div class="toprow"><h1>Jairo Top Chef</h1><div class="row"><button class="ghost" id="viewToggle">${state.view==='grid'?'☷':'▦'}</button></div></div><div class="search"><span>⌕</span><input id="globalSearch" value="${esc(state.search)}" placeholder="Buscar receta, código, ingrediente..."></div></header><div id="content" class="content"></div>${nav()}${state.profile.role==='admin'?'<button class="fab" id="newRecipe">＋</button>':''}</main>`;
 $('#globalSearch').oninput=e=>{state.search=e.target.value;renderSection()};
 $('#viewToggle').onclick=()=>{state.view=state.view==='grid'?'list':'grid';renderShell()};
 document.querySelectorAll('[data-nav]').forEach(b=>b.onclick=()=>{state.section=b.dataset.nav;renderShell()});
 if($('#newRecipe'))$('#newRecipe').onclick=()=>openRecipeForm();
 renderSection();
}
function renderSection(){if(state.section==='home'||state.section==='recipes')renderRecipes();else if(state.section==='menu')renderMenu();else if(state.section==='changes')renderChanges();else renderSettings()}
async function filteredRecipes(){
 const q=state.search.trim().toLowerCase();let rows=state.recipes;
 if(state.category)rows=rows.filter(r=>r.category_id===state.category);
 if(!q)return rows;
 const ingredientIds=state.ingredients.filter(i=>[i.name,i.canonical_name,...(i.aliases||[])].some(x=>String(x).toLowerCase().includes(q))).map(i=>i.id);
 let recipeIds=[];
 if(ingredientIds.length){const {data}=await sb.from('recipe_ingredients').select('recipe_id').in('ingredient_id',ingredientIds);recipeIds=(data||[]).map(x=>x.recipe_id)}
 return rows.filter(r=>[r.title,r.code,r.instructions,r.notes,r.categories?.name].some(x=>String(x||'').toLowerCase().includes(q))||recipeIds.includes(r.id));
}
async function renderRecipes(){
 const c=$('#content');c.innerHTML='<div class="empty">Buscando...</div>';const rows=await filteredRecipes();
 c.innerHTML=`${state.section==='home'?'<div class="section-head"><h2>Recetas</h2><span class="meta">'+rows.length+' recetas</span></div>':''}
 <div class="chips"><button class="chip ${!state.category?'active':''}" data-cat="">Todas</button>${state.categories.map(x=>`<button class="chip ${state.category===x.id?'active':''}" data-cat="${x.id}">${esc(x.name)}</button>`).join('')}</div>
 <div class="section-head"><h2>${state.search?'Resultados':'Todas las recetas'}</h2></div>
 <div class="recipe-grid ${state.view}">${rows.length?rows.map(recipeCard).join(''):'<div class="empty">No hay recetas que coincidan.</div>'}</div>`;
 document.querySelectorAll('[data-cat]').forEach(b=>b.onclick=()=>{state.category=b.dataset.cat||null;renderRecipes()});
 document.querySelectorAll('[data-recipe]').forEach(b=>b.onclick=()=>openRecipe(b.dataset.recipe));
}
function recipeCard(r){
 const photo=(r.recipe_photos||[]).sort((a,b)=>Number(b.is_primary)-Number(a.is_primary)||a.sort_order-b.sort_order)[0];
 return `<article class="card" data-recipe="${r.id}">${photo?'<div class="photo-placeholder" data-photo="'+esc(photo.storage_path)+'">🍽</div>':'<div class="photo-placeholder">🍽</div>'}<div class="card-body"><h3>${esc(r.title)}</h3><div class="meta">${esc(r.code)} · ${esc(r.categories?.name||'Sin categoría')}</div><div class="meta">${r.servings||'—'} raciones · ${(r.prep_minutes||0)+(r.cook_minutes||0)} min</div></div></article>`;
}
async function signedPhoto(path){const {data}=await sb.storage.from('recipe-photos').createSignedUrl(path,3600);return data?.signedUrl}
async function openRecipe(id){
 const {data:r,error}=await sb.from('recipes').select('*,categories(name),recipe_ingredients(*,ingredients(*)),recipe_tags(*,tags(*)),recipe_photos(*)').eq('id',id).single();if(error)return toast(error.message);
 const photos=(r.recipe_photos||[]).sort((a,b)=>Number(b.is_primary)-Number(a.is_primary)||a.sort_order-b.sort_order);
 const urls=await Promise.all(photos.map(p=>signedPhoto(p.storage_path)));
 const modal=document.createElement('div');modal.className='modal';modal.innerHTML=`<div class="sheet"><div class="sheet-head"><h2>Receta</h2><button class="ghost close">✕</button></div>
 ${urls.length?'<div class="photo-strip">'+urls.map((u,i)=>u?'<img src="'+u+'" alt="'+esc(photos[i].caption||r.title)+'">':'').join('')+'</div>':''}
 <h1 class="hero-title">${esc(r.title)}</h1><div class="detail-meta"><span class="badge">${esc(r.code)}</span><span class="badge">${esc(r.categories?.name||'Sin categoría')}</span><span class="badge">${r.servings||'—'} raciones</span><span class="badge">Prep. ${r.prep_minutes||0} min</span><span class="badge">Cocción ${r.cook_minutes||0} min</span></div>
 <div class="panel"><div class="section-head"><h2>Ingredientes</h2></div><ul class="ingredient-list">${(r.recipe_ingredients||[]).sort((a,b)=>a.sort_order-b.sort_order).map(x=>`<li><b>${x.quantity??''} ${esc(x.unit||'')}</b> ${esc(x.ingredients?.name||'')} ${x.preparation_note?'· '+esc(x.preparation_note):''}</li>`).join('')||'<li>Sin ingredientes registrados.</li>'}</ul></div>
 <div class="panel"><h2>Preparación</h2><div class="steps">${esc(r.instructions||'Sin preparación registrada.')}</div></div>
 ${r.notes?'<div class="panel"><h2>Observaciones</h2><div class="steps">'+esc(r.notes)+'</div></div>':''}
 <div class="row">${state.profile.role==='admin'?'<button class="primary edit">Editar receta</button><button class="danger archive">Archivar</button>':state.profile.role==='collaborator'?'<button class="primary propose">Proponer cambio</button>':''}</div></div>`;
 document.body.appendChild(modal);modal.querySelector('.close').onclick=()=>modal.remove();modal.onclick=e=>{if(e.target===modal)modal.remove()};
 if(modal.querySelector('.edit'))modal.querySelector('.edit').onclick=()=>{modal.remove();openRecipeForm(r)};
 if(modal.querySelector('.archive'))modal.querySelector('.archive').onclick=async()=>{if(!confirm('¿Mover esta receta al archivo?'))return;await sb.from('recipes').update({deleted_at:new Date().toISOString(),status:'archived'}).eq('id',r.id);modal.remove();await loadBase();renderShell()};
 if(modal.querySelector('.propose'))modal.querySelector('.propose').onclick=()=>{modal.remove();openProposal(r)};
}
function ingredientInput(row={}){
 const id=row.ingredient_id||'', ing=state.ingredients.find(i=>i.id===id);
 return `<div class="ingredient-row" data-ing-row><div class="relative"><input class="ing-name" value="${esc(ing?.name||row.name||'')}" placeholder="Ingrediente" autocomplete="off"><input type="hidden" class="ing-id" value="${esc(id)}"><div class="suggestions" hidden></div></div><input class="ing-qty" type="number" step="0.001" value="${row.quantity??''}" placeholder="Cant."><input class="ing-unit" value="${esc(row.unit||'')}" placeholder="g, ml, ud."><button type="button" class="remove-ing">×</button></div>`;
}
function bindIngredientRows(root){
 root.querySelectorAll('[data-ing-row]').forEach(row=>{
  row.querySelector('.remove-ing').onclick=()=>row.remove();
  const inp=row.querySelector('.ing-name'),box=row.querySelector('.suggestions');
  inp.oninput=()=>{row.querySelector('.ing-id').value='';const q=inp.value.toLowerCase();const hits=state.ingredients.filter(i=>[i.name,i.canonical_name,...(i.aliases||[])].some(x=>String(x).toLowerCase().includes(q))).slice(0,8);box.innerHTML=hits.map(i=>`<button type="button" data-id="${i.id}" data-name="${esc(i.name)}">${esc(i.name)} <span class="meta">${esc(i.group_name||'')}</span></button>`).join('');box.hidden=!q||!hits.length;box.querySelectorAll('button').forEach(b=>b.onclick=()=>{inp.value=b.dataset.name;row.querySelector('.ing-id').value=b.dataset.id;box.hidden=true})};
 });
}
async function openRecipeForm(existing=null){
 let full=existing;
 if(existing?.id&&!existing.recipe_ingredients){const {data}=await sb.from('recipes').select('*,recipe_ingredients(*)').eq('id',existing.id).single();full=data}
 const modal=document.createElement('div');modal.className='modal';modal.innerHTML=`<div class="sheet"><div class="sheet-head"><h2>${full?'Editar':'Nueva'} receta</h2><button class="ghost close">✕</button></div><form id="recipeForm" class="form-grid">
 <div><div class="label">Nombre</div><input name="title" value="${esc(full?.title||'')}" required></div>
 <div class="two"><div><div class="label">Código</div><input name="code" value="${esc(full?.code||'')}" required placeholder="CAR-001"></div><div><div class="label">Categoría</div><select name="category_id"><option value="">Sin categoría</option>${state.categories.map(c=>`<option value="${c.id}" ${full?.category_id===c.id?'selected':''}>${esc(c.name)}</option>`).join('')}</select></div></div>
 <div class="two"><div><div class="label">Raciones base</div><input name="servings" type="number" step=".1" value="${full?.servings??''}"></div><div><div class="label">Foto(s)</div><input id="photos" type="file" accept="image/*" multiple></div></div>
 <div class="two"><div><div class="label">Preparación (min)</div><input name="prep_minutes" type="number" value="${full?.prep_minutes??''}"></div><div><div class="label">Cocción (min)</div><input name="cook_minutes" type="number" value="${full?.cook_minutes??''}"></div></div>
 <div><div class="section-head"><h2>Ingredientes</h2><button type="button" id="addIngredient">＋ Añadir</button></div><div id="ingredientsBox">${(full?.recipe_ingredients||[]).sort((a,b)=>a.sort_order-b.sort_order).map(ingredientInput).join('')||ingredientInput()}</div></div>
 <div><div class="label">Preparación paso a paso</div><textarea name="instructions" required>${esc(full?.instructions||'')}</textarea></div>
 <div><div class="label">Observaciones</div><textarea name="notes">${esc(full?.notes||'')}</textarea></div>
 <button class="primary">Guardar receta</button></form></div>`;
 document.body.appendChild(modal);bindIngredientRows(modal);modal.querySelector('.close').onclick=()=>modal.remove();
 modal.querySelector('#addIngredient').onclick=()=>{modal.querySelector('#ingredientsBox').insertAdjacentHTML('beforeend',ingredientInput());bindIngredientRows(modal)};
 modal.querySelector('#recipeForm').onsubmit=async e=>{e.preventDefault();const f=new FormData(e.target),payload={title:f.get('title').trim(),code:f.get('code').trim(),category_id:f.get('category_id')||null,servings:Number(f.get('servings'))||null,prep_minutes:Number(f.get('prep_minutes'))||0,cook_minutes:Number(f.get('cook_minutes'))||0,instructions:f.get('instructions').trim(),notes:f.get('notes').trim(),created_by:full?.created_by||state.profile.id,updated_by:state.profile.id};
   let rid=full?.id;if(rid){const {error}=await sb.from('recipes').update(payload).eq('id',rid);if(error)return toast(error.message);await sb.from('recipe_ingredients').delete().eq('recipe_id',rid)}
   else{const {data,error}=await sb.from('recipes').insert(payload).select().single();if(error)return toast(error.message);rid=data.id}
   const rows=[...modal.querySelectorAll('[data-ing-row]')].map((x,n)=>({recipe_id:rid,ingredient_id:x.querySelector('.ing-id').value,quantity:Number(x.querySelector('.ing-qty').value)||null,unit:x.querySelector('.ing-unit').value.trim()||null,sort_order:n})).filter(x=>x.ingredient_id);
   if(rows.length)await sb.from('recipe_ingredients').insert(rows);
   const files=[...modal.querySelector('#photos').files];for(let n=0;n<files.length;n++){const file=files[n],path=`${rid}/${crypto.randomUUID()}-${file.name.replace(/[^a-zA-Z0-9._-]/g,'_')}`;const {error}=await sb.storage.from('recipe-photos').upload(path,file);if(!error)await sb.from('recipe_photos').insert({recipe_id:rid,storage_path:path,is_primary:!full&&n===0,sort_order:n,created_by:state.profile.id})}
   modal.remove();await loadBase();renderShell();toast('Receta guardada');
 };
}
function openProposal(r){
 const modal=document.createElement('div');modal.className='modal';modal.innerHTML=`<div class="sheet"><div class="sheet-head"><h2>Proponer cambio</h2><button class="ghost close">✕</button></div><form id="proposal" class="form-grid"><p class="muted">La receta publicada no cambiará hasta que un administrador apruebe tu propuesta.</p><div><div class="label">Nombre</div><input name="title" value="${esc(r.title)}"></div><div><div class="label">Preparación</div><textarea name="instructions">${esc(r.instructions)}</textarea></div><div><div class="label">Motivo del cambio</div><textarea name="reason" required></textarea></div><button class="primary">Enviar propuesta</button></form></div>`;document.body.appendChild(modal);modal.querySelector('.close').onclick=()=>modal.remove();modal.querySelector('#proposal').onsubmit=async e=>{e.preventDefault();const f=new FormData(e.target);const {error}=await sb.from('change_requests').insert({recipe_id:r.id,action:'update',proposed_data:{title:f.get('title'),instructions:f.get('instructions')},reason:f.get('reason'),requested_by:state.profile.id});if(error)return toast(error.message);modal.remove();toast('Propuesta enviada')};
}
async function renderMenu(){
 const c=$('#content');c.innerHTML='<div class="empty">Cargando menú...</div>';const today=new Date().toISOString().slice(0,10);let {data:menu}=await sb.from('daily_menus').select('*').eq('menu_date',today).maybeSingle();
 if(!menu&&state.profile.role==='admin'){const {data}=await sb.from('daily_menus').insert({menu_date:today,created_by:state.profile.id}).select().single();menu=data}
 let items=[];if(menu){const {data}=await sb.from('daily_menu_items').select('*,recipes(title,code)').eq('menu_id',menu.id).order('sort_order');items=data||[]}
 c.innerHTML=`<div class="section-head"><h2>Menú de hoy</h2><span class="meta">${today}</span></div>${state.profile.role==='admin'&&menu?'<button id="addMenu" class="primary">＋ Añadir receta</button>':''}<div style="margin-top:12px">${items.length?items.map(x=>`<div class="menu-row"><div class="between row"><div><b>${esc(x.recipes?.title)}</b><div class="meta">${esc(x.recipes?.code)} · ${x.target_servings||'—'} raciones</div></div><select class="status-select" data-menu-status="${x.id}">${['pending','prepared','cooking','finished'].map(s=>`<option value="${s}" ${x.status===s?'selected':''}>${statusName(s)}</option>`).join('')}</select></div></div>`).join(''):'<div class="empty">Todavía no hay platos en el menú de hoy.</div>'}</div>`;
 document.querySelectorAll('[data-menu-status]').forEach(s=>{s.disabled=state.profile.role!=='admin';s.onchange=()=>sb.from('daily_menu_items').update({status:s.value}).eq('id',s.dataset.menuStatus)});
 if($('#addMenu'))$('#addMenu').onclick=()=>openMenuAdd(menu);
}
function openMenuAdd(menu){
 const modal=document.createElement('div');modal.className='modal';modal.innerHTML=`<div class="sheet"><div class="sheet-head"><h2>Añadir al menú</h2><button class="ghost close">✕</button></div><form id="menuAdd" class="form-grid"><select name="recipe_id" required><option value="">Selecciona receta</option>${state.recipes.map(r=>`<option value="${r.id}">${esc(r.title)} · ${esc(r.code)}</option>`).join('')}</select><input name="target" type="number" step=".1" placeholder="Raciones previstas"><button class="primary">Añadir</button></form></div>`;document.body.appendChild(modal);modal.querySelector('.close').onclick=()=>modal.remove();modal.querySelector('#menuAdd').onsubmit=async e=>{e.preventDefault();const f=new FormData(e.target),{error}=await sb.from('daily_menu_items').insert({menu_id:menu.id,recipe_id:f.get('recipe_id'),target_servings:Number(f.get('target'))||null});if(error)return toast(error.message);modal.remove();renderMenu()};
}
async function renderChanges(){
 const c=$('#content');c.innerHTML='<div class="empty">Cargando...</div>';
 if(state.profile.role==='admin'){
  const [{data:req},{data:users}]=await Promise.all([sb.from('change_requests').select('*,recipes(title),profiles!change_requests_requested_by_fkey(full_name)').eq('status','pending').order('requested_at'),sb.from('profiles').select('*').eq('status','pending').order('created_at')]);
  c.innerHTML=`<div class="section-head"><h2>Usuarios pendientes</h2></div>${(users||[]).map(u=>`<div class="user-row"><b>${esc(u.full_name||'Usuario')}</b><div class="meta">${new Date(u.created_at).toLocaleString('es')}</div><div class="row" style="margin-top:8px"><select data-role="${u.id}"><option value="viewer">Usuario</option><option value="collaborator">Colaborador</option><option value="admin">Administrador</option></select><button class="primary" data-approve="${u.id}">Aprobar</button></div></div>`).join('')||'<div class="empty">No hay usuarios pendientes.</div>'}
  <div class="section-head"><h2>Cambios pendientes</h2></div>${(req||[]).map(x=>`<div class="change-row"><b>${esc(x.recipes?.title||'Nueva receta')}</b><div class="meta">Solicitado por ${esc(x.profiles?.full_name||'Colaborador')}</div><p>${esc(x.reason||'Sin motivo')}</p><div class="row"><button class="primary" data-change-approve="${x.id}">Aprobar</button><button data-change-reject="${x.id}">Rechazar</button></div></div>`).join('')||'<div class="empty">No hay propuestas pendientes.</div>'}`;
  document.querySelectorAll('[data-approve]').forEach(b=>b.onclick=async()=>{const id=b.dataset.approve,role=document.querySelector('[data-role="'+id+'"]').value;const {error}=await sb.from('profiles').update({status:'active',role,approved_at:new Date().toISOString(),approved_by:state.profile.id}).eq('id',id);if(error)return toast(error.message);renderChanges()});
  document.querySelectorAll('[data-change-approve]').forEach(b=>b.onclick=()=>reviewChange(b.dataset.changeApprove,true));
  document.querySelectorAll('[data-change-reject]').forEach(b=>b.onclick=()=>reviewChange(b.dataset.changeReject,false));
 }else{
  const {data}=await sb.from('change_requests').select('*,recipes(title)').order('requested_at',{ascending:false});
  c.innerHTML=`<div class="section-head"><h2>Mis propuestas</h2></div>${(data||[]).map(x=>`<div class="change-row"><b>${esc(x.recipes?.title||'Receta')}</b><span class="badge ${x.status==='approved'?'ok':x.status==='pending'?'warn':''}">${statusName(x.status)}</span><p class="meta">${esc(x.reason||'')}</p></div>`).join('')||'<div class="empty">No has enviado propuestas.</div>'}`;
 }
}
async function reviewChange(id,approve){
 const {data:r}=await sb.from('change_requests').select('*').eq('id',id).single();
 if(approve&&r.action==='update'&&r.recipe_id){const allowed={};for(const k of ['title','instructions','notes','code','servings','prep_minutes','cook_minutes','category_id'])if(k in r.proposed_data)allowed[k]=r.proposed_data[k];const {error}=await sb.from('recipes').update(allowed).eq('id',r.recipe_id);if(error)return toast(error.message)}
 await sb.from('change_requests').update({status:approve?'approved':'rejected',reviewed_by:state.profile.id,reviewed_at:new Date().toISOString()}).eq('id',id);await loadBase();renderChanges();toast(approve?'Cambio aprobado':'Cambio rechazado');
}
function renderSettings(){
 const c=$('#content');c.innerHTML=`<div class="panel"><h2>${esc(state.profile.full_name||'Usuario')}</h2><p class="muted">${esc(state.session.user.email||'')}</p><span class="badge">${roleName(state.profile.role)}</span></div><div class="panel"><h2>Jairo Top Chef</h2><p class="muted">Aplicación móvil de recetas profesionales.</p><button id="logout">Cerrar sesión</button></div>`;$('#logout').onclick=()=>sb.auth.signOut();
}
if('serviceWorker'in navigator)navigator.serviceWorker.register('./sw.js').catch(()=>{});
init();