(() => {
  'use strict';
  const $ = selector => document.querySelector(selector);
  const $$ = selector => [...document.querySelectorAll(selector)];
  const page = document.body.dataset.page;
  let csrf = '', enrollmentId = '', noticeTimer;
  const state = { products:[], packages:[], services:[], contacts:[], product:null, package:null, service:null };
  function notify(message, error = false) {
    const node = $('#notice');
    node.textContent = message; node.hidden = false; node.classList.toggle('error', error);
    clearTimeout(noticeTimer); noticeTimer = setTimeout(()=>{node.hidden=true;},error?14000:5000);
  }
  async function api(path, method = 'GET', body) {
    const response = await fetch(path, { method, credentials:'same-origin', cache:'no-store', headers:method === 'GET' ? {} : {'Content-Type':'application/json','X-VEZLIO-CSRF':csrf}, ...(body === undefined ? {} : {body:JSON.stringify(body)}) });
    const data = await response.json();
    if (!response.ok) {
      if (data.error?.code === 'sign_in_required' && page === 'dashboard') location.replace('/admin/login');
      if (data.error?.code === 'mfa_required' && page === 'dashboard') location.replace('/admin/mfa');
      throw new Error(data.error?.message || 'The request could not be completed.');
    }
    return data;
  }
  function element(tag, text, className) {
    const node = document.createElement(tag);
    if (text !== undefined) node.textContent = text;
    if (className) node.className = className;
    return node;
  }
  const money = value => value === null || value === undefined ? 'Contact for details' : new Intl.NumberFormat('en-LK',{style:'currency',currency:'LKR'}).format(value);
  function fill(form, data = {}) {
    form.reset();
    for (const field of [...form.elements].filter(x=>x.name)) {
      if (field.type === 'checkbox') field.checked = data[field.name] === true;
      else if (Object.hasOwn(data,field.name)) field.value = data[field.name] ?? '';
    }
  }
  function values(form) {
    const out = {};
    for (const field of [...form.elements].filter(x=>x.name)) out[field.name] = field.type === 'checkbox' ? field.checked : field.type === 'password' ? field.value : field.value.trim();
    return out;
  }
  async function busy(form, fn) {
    const button = form.querySelector('[type="submit"]');
    const text = button.textContent; button.disabled = true; button.textContent = 'Saving…';
    try { await fn(); } catch (error) { notify(error.message,true); }
    finally { button.disabled = false; button.textContent = text; }
  }
  async function session() {
    const result = await api('/api/auth/session'); csrf = result.csrf; return result;
  }
  function handleForm(id, fn) {
    const form = $(id);
    if (!form) return;
    form.addEventListener('submit', event=>{event.preventDefault(); if(event.currentTarget.reportValidity()) busy(event.currentTarget,()=>fn(event.currentTarget));});
    form.querySelector('[type="submit"]').disabled = false;
  }
  async function boot() {
    if (['unavailable','forbidden'].includes(page)) return;
    const current = await session();
    if (page === 'login') {
      if (current.state === 'authenticated') return location.replace('/admin');
      handleForm('#loginForm',async form=>{const result=await api('/api/auth/login','POST',values(form));form.reset();location.assign(result.next);});
    }
    $('#logout')?.addEventListener('click',async()=>{
      try { const result=await api('/api/auth/logout','POST',{}); location.replace(result.next); }
      catch(error) { notify(error.message,true); }
    });
    if (page === 'mfa') {
      if (current.state === 'anonymous') return location.replace('/admin/login');
      if (current.state === 'authenticated') return location.replace('/admin');
      $('#mfaDescription').textContent = current.factors.length ? 'Enter the current code from your enrolled authenticator.' : current.enrollmentAllowed ? 'Set up a TOTP authenticator, then verify a code to unlock the workspace.' : 'An MFA factor already exists. Use the documented owner recovery procedure to restore TOTP access.';
      const selector=$('#factorSelect');
      for (const f of current.factors) { const option=element('option',f.name); option.value=f.id; selector.append(option); }
      $('#factorLabel').hidden=current.factors.length<2;
      $('#mfaForm').hidden=!current.factors.length;
      $('#enrollment').hidden=!current.enrollmentAllowed;
      $('#enrollButton').addEventListener('click',async event=>{
        const button=event.currentTarget; button.disabled=true;
        try {
          const result=await api('/api/auth/mfa/enroll','POST',{}); enrollmentId=result.factorId;
          // Display the QR in an image context. Never inject returned SVG into the DOM.
          const svg=result.qrCode.startsWith('data:image/svg+xml;utf-8,')?result.qrCode.slice('data:image/svg+xml;utf-8,'.length):result.qrCode;
          $('#qrCode').src='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(svg);
          $('#manualKey').value=result.secret; $('#qrArea').hidden=false; $('#mfaForm').hidden=false;
          button.hidden=true; $('#mfaForm [name="code"]').focus();
        } catch(error) { notify(error.message,true);button.disabled=false; }
      });
      handleForm('#mfaForm',async form=>{const result=await api('/api/auth/mfa/verify','POST',{factorId:enrollmentId||selector.value,code:form.elements.code.value});$('#manualKey').value='';$('#qrCode').removeAttribute('src');form.reset();location.replace(result.next);});
    }
    if (page === 'dashboard') {
      if (current.state !== 'authenticated') return location.replace(current.state === 'anonymous'?'/admin/login':'/admin/mfa');
      await load(); bindDashboard(); showTab();
    }
  }
  async function load() {
    const kinds=['products','packages','services','contacts'];
    const data=await Promise.all(kinds.map(kind=>api('/api/admin/'+kind)));
    data.forEach((result,i)=>{state[kinds[i]]=result.records;});
    render(); fill($('#contactForm'),state.contacts[0]);
  }
  function summary(label,count,detail) { const card=element('article',undefined,'surface summary');card.append(element('span',label,'muted'),element('strong',String(count)),element('small',detail));return card; }
  function render() {
    $('#summaryCards').replaceChildren(summary('Products',state.products.length,'Actual database records'),summary('Published plans',state.packages.filter(p=>p.published&&state.products.some(x=>x.id===p.product_id&&x.published)).length,'Across published products'),summary('Services',state.services.length,'Drafts & published listings'));
    list('products','#productList',editProduct); list('services','#serviceList',editService);
    if (state.product?.id) renderPackages();
  }
  function list(kind,selector,edit) {
    const container=$(selector);container.replaceChildren();
    if (!state[kind].length) {const empty=element('div',undefined,'surface empty');empty.append(element('span','◇','empty-icon'),element('h3','A clean start.'),element('p','No '+kind+' have been added. Create a real listing to get started.','muted'));container.append(empty);return;}
    state[kind].forEach(item=>{
      const card=element('article',undefined,'surface record');
      const heading=element('div',undefined,'record-heading');heading.append(element('h3',item.name),element('span',item.published?'Published':'Draft',item.published?'status published':'status'));
      card.append(heading,element('p',item.description,'muted'),element('small',kind==='services'?item.platform+' · '+item.service_code:item.category));
      const button=element('button','Edit '+(kind==='services'?'service':'product'),'secondary');button.type='button';button.addEventListener('click',()=>edit(item));card.append(button);container.append(card);
    });
  }
  function showEditor(selector,title,form,data) {$(selector).hidden=false;$(selector+'Title').textContent=title;fill($(form),data);$(form+' [data-delete]').hidden=!data?.id;$(selector).scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth',block:'start'});}
  function editProduct(item=null) {
    state.product=item;state.package=null;
    showEditor('#productEditor',item?'Edit product':'New product','#productForm',item||{});
    $('#packagesArea').hidden=!item?.id;$('#packageForm').hidden=true;
    if(item)renderPackages();
  }
  function editService(item=null) { state.service=item;showEditor('#serviceEditor',item?'Edit service':'New service','#serviceForm',item||{}); }
  function renderPackages() {
    const container=$('#packageList');container.replaceChildren();
    const plans=state.packages.filter(p=>p.product_id===state.product?.id);
    if(!plans.length)container.append(element('p','No packages yet.','muted'));
    plans.forEach(plan=>{const row=element('div',undefined,'plan-row');const info=element('div');info.append(element('strong',plan.name),element('small',money(plan.price_lkr)+' · '+(plan.duration||'Duration to confirm')+' · '+(plan.published?'Published':'Draft')));const button=element('button','Edit','secondary');button.type='button';button.addEventListener('click',()=>editPackage(plan));row.append(info,button);container.append(row);});
  }
  function editPackage(plan=null) {state.package=plan;$('#packageForm').hidden=false;$('#packageEditorTitle').textContent=plan?'Edit package':'New package';fill($('#packageForm'),plan||{});$('#packageForm [data-delete]').hidden=!plan;}
  async function save(kind,item,data) {
    return item?api('/api/admin/'+kind+'/'+item.id,'PATCH',{updated_at:item.updated_at,values:data}):api('/api/admin/'+kind,'POST',data);
  }
  function updateState(kind,record) {const i=state[kind].findIndex(x=>x.id===record.id);if(i===-1)state[kind].push(record);else state[kind][i]=record;render();notify('Saved to the database.');}
  async function remove(kind,item) {
    if(!item)return;
    const dialog=$('#confirmDelete');$('#deleteDescription').textContent=kind==='products'?'This product and all of its packages will be permanently removed.':'This record will be permanently removed from the database.';
    dialog.returnValue='cancel';dialog.showModal();
    const answer=await new Promise(resolve=>dialog.addEventListener('close',()=>resolve(dialog.returnValue),{once:true}));
    if(answer!=='delete')return;
    await api('/api/admin/'+kind+'/'+item.id,'DELETE',{updated_at:item.updated_at});
    state[kind]=state[kind].filter(x=>x.id!==item.id);
    if(kind==='products'){state.packages=state.packages.filter(x=>x.product_id!==item.id);state.product=null;$('#productEditor').hidden=true;}
    if(kind==='services'){state.service=null;$('#serviceEditor').hidden=true;}
    if(kind==='packages'){state.package=null;$('#packageForm').hidden=true;}
    render();notify('Record deleted.');
  }
  function bindDashboard() {
    $('#newProduct').addEventListener('click',()=>editProduct());$('#newService').addEventListener('click',()=>editService());$('#newPackage').addEventListener('click',()=>editPackage());
    handleForm('#productForm',async form=>{const result=await save('products',state.product,values(form));state.product=result.record;updateState('products',result.record);editProduct(result.record);});
    handleForm('#serviceForm',async form=>{const result=await save('services',state.service,values(form));state.service=result.record;updateState('services',result.record);editService(result.record);});
    handleForm('#packageForm',async form=>{const data={...values(form),product_id:state.product.id};const result=await save('packages',state.package,data);updateState('packages',result.record);$('#packageForm').hidden=true;state.package=null;});
    handleForm('#contactForm',async form=>{const result=await api('/api/admin/contacts','PATCH',{updated_at:state.contacts[0].updated_at,values:values(form)});state.contacts=[result.record];notify('Public contact settings saved.');});
    [['#productForm','products','product'],['#serviceForm','services','service'],['#packageForm','packages','package']].forEach(([selector,kind,key])=>{
      $(selector+' [data-delete]').addEventListener('click',()=>remove(kind,state[key]).catch(error=>notify(error.message,true)));
      $(selector+' [data-cancel]').addEventListener('click',()=>{$(selector).closest(selector==='#packageForm'?'form':'.editor').hidden=true;});
    });
    window.addEventListener('hashchange',showTab);
    document.addEventListener('visibilitychange',()=>{if(!document.hidden)session().then(s=>{if(s.state!=='authenticated')location.replace('/admin/login');}).catch(()=>{location.replace('/admin/login');});});
  }
  function showTab() {const tab=['overview','products','services','contacts'].includes(location.hash.slice(1))?location.hash.slice(1):'overview';$$('[data-panel]').forEach(x=>{x.hidden=x.dataset.panel!==tab;});$$('[data-tab]').forEach(x=>{x.classList.toggle('active',x.dataset.tab===tab);if(x.dataset.tab===tab)x.setAttribute('aria-current','page');else x.removeAttribute('aria-current');});$('#sectionTitle').textContent={overview:'Overview',products:'Products & plans',services:'Social Media Boosting',contacts:'Contact settings'}[tab];}
  window.addEventListener('pageshow',event=>{if(event.persisted&&['dashboard','mfa'].includes(page))location.reload();});
  boot().catch(error=>notify(error.message,true));
})();
