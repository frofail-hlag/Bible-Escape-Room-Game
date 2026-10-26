/* Ava Kerolos Rewards teacher dashboard — bilingual, teacher-only UI. */
(function () {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const escHtml = (value) => String(value == null ? "" : value).replace(/[&<>"']/g, (c) => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const moneyPoints = (value) => String(Math.max(0, Math.round(Number(value) || 0)));
  let activeTab = "overview";
  let cache = { students: [], rewards: [], redemptions: [], transactions: [] };
  let message = "";
  let busy = false;

  async function api() {
    if (!window.waitForBibleFirebaseApi) throw new Error("Firebase-Modul nicht geladen.");
    const service = await window.waitForBibleFirebaseApi();
    const teacher = await service.getCurrentTeacher();
    if (!teacher || teacher.active !== true) throw new Error("Ein aktives Lehrkraftkonto ist erforderlich.");
    return service;
  }
  function say(text, error) {
    message = text || "";
    const el = $("rewardsMessage");
    if (el) { el.textContent = message; el.className = error ? "feedback bad" : "notice"; el.hidden = !message; }
  }
  function nav() {
    return "<div class='teacher-nav'><button class='btn secondary' onclick='teacherDashboard()'>← Lehrerbereich</button><button class='btn secondary' onclick='rewardsRefresh()'>↻ Aktualisieren</button><button class='btn secondary' onclick='teacherLogout()'>Abmelden</button></div>";
  }
  function renderShell() {
    const appRoot = document.getElementById("app");
    if (!appRoot) return;
    appRoot.innerHTML = "<main class='app'>" + (typeof header === "function" ? header("Ava Kerolos Rewards · المكافآت") : "") +
      nav() + "<section class='hero activity-mode-hero'><h1>🎁 Ava Kerolos Rewards</h1><p>Schüler, Punkte, Belohnungen und Einlösungen verwalten.</p><p class='lang-ar' dir='rtl'>إدارة الطلاب والنقاط والمكافآت وطلبات الاستبدال.</p></section>" +
      "<div id='rewardsMessage' class='notice' role='status' aria-live='polite' hidden></div>" +
      "<div class='teacher-nav rewards-tabs'>" +
      "<button class='btn " + (activeTab==="overview"?"":"secondary") + "' onclick=\"rewardsTab('overview')\">Übersicht / نظرة عامة</button>" +
      "<button class='btn " + (activeTab==="students"?"":"secondary") + "' onclick=\"rewardsTab('students')\">Schüler / الطلاب</button>" +
      "<button class='btn " + (activeTab==="catalogue"?"":"secondary") + "' onclick=\"rewardsTab('catalogue')\">Belohnungen / المكافآت</button>" +
      "<button class='btn " + (activeTab==="redemptions"?"":"secondary") + "' onclick=\"rewardsTab('redemptions')\">Einlösungen / طلبات الاستبدال</button>" +
      "<button class='btn " + (activeTab==="transactions"?"":"secondary") + "' onclick=\"rewardsTab('transactions')\">Punkteverlauf / سجل النقاط</button></div>" +
      "<div id='rewardsContent'><section class='card'><p>Rewards werden geladen… / جارٍ تحميل المكافآت…</p></section></div></main>";
    if (message) say(message);
  }
  function fmtDate(value) {
    if (!value) return "—";
    const date = value.toDate ? value.toDate() : new Date(value);
    return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString("de-DE");
  }
  function table(headers, rows, empty) {
    return rows.length ? "<div style='overflow:auto'><table class='data-table'><thead><tr>" + headers.map(h=>"<th>"+h+"</th>").join("") +
      "</tr></thead><tbody>" + rows.join("") + "</tbody></table></div>" : "<div class='empty'>" + empty + "</div>";
  }
  function renderOverview() {
    const pending = cache.redemptions.filter(r=>r.status==="pending").length;
    const totalBalance = cache.students.reduce((sum,s)=>sum+(Number(s.balance)||0),0);
    return "<div class='dashboard-grid'><div class='stat'><span class='small'>Schüler / الطلاب</span><strong>"+cache.students.length+"</strong></div>" +
      "<div class='stat'><span class='small'>Punkte im Umlauf / النقاط المتاحة</span><strong>"+moneyPoints(totalBalance)+"</strong></div>" +
      "<div class='stat'><span class='small'>Aktive Belohnungen / المكافآت النشطة</span><strong>"+cache.rewards.filter(r=>r.active===true).length+"</strong></div>" +
      "<div class='stat'><span class='small'>Offene Einlösungen / الطلبات المعلقة</span><strong>"+pending+"</strong></div></div>" +
      "<section class='card'><h2>Offene Einlösungen / طلبات الاستبدال المعلقة</h2>" +
      table(["Schüler","Belohnung","Punkte","Datum","Aktion"], cache.redemptions.filter(r=>r.status==="pending").slice(0,8).map(r=>"<tr><td>"+escHtml(r.studentName||r.studentUid)+"</td><td>"+escHtml(r.rewardName||r.rewardId)+"</td><td>"+moneyPoints(r.cost)+"</td><td>"+fmtDate(r.createdAt)+"</td><td><button class='btn success' onclick=\"rewardsReview('"+escHtml(r.id)+"','approve')\">Genehmigen</button> <button class='btn danger' onclick=\"rewardsReview('"+escHtml(r.id)+"','reject')\">Ablehnen</button></td></tr>"),"Keine offenen Einlösungen. / لا توجد طلبات معلقة.")+"</section>";
  }
  function renderStudents() {
    return "<section class='card'><h2>Neuen Schüler anlegen / إضافة طالب جديد</h2><div class='field-row'>" +
      "<div class='field'><label>Name / الاسم</label><input id='rwName' maxlength='80' autocomplete='off'></div>" +
      "<div class='field'><label>Klasse / الفصل</label><select id='rwClass'><option value='Malayka'>Angels / Malayka</option><option value='AvaKerelos'>Ava Kerelos</option><option value='AbounaFaltaous'>Abouna Faltaous</option></select></div></div>" +
      "<div class='field-row'><div class='field'><label>Schülercode (4–24 Zeichen) / كود الطالب</label><input id='rwCode' maxlength='24' autocapitalize='characters'></div>" +
      "<div class='field'><label>PIN (4–10 Ziffern) / الرقم السري</label><input id='rwPin' type='password' inputmode='numeric' maxlength='10' autocomplete='new-password'></div></div>" +
      "<button class='btn' onclick='rewardsCreateStudent()'>Schüler erstellen / إنشاء الطالب</button><p class='small'>Die PIN wird serverseitig gehasht und nicht gespeichert oder angezeigt.</p></section>" +
      "<section class='card'><h2>Schülerübersicht / قائمة الطلاب</h2>"+table(["Name","Klasse","Code","Punkte","Gesamt verdient","Status","Aktion"],cache.students.map(s=>"<tr><td>"+escHtml(s.displayName)+"</td><td>"+escHtml(s.classId)+"</td><td>"+escHtml(s.studentCode||"—")+"</td><td><strong>"+moneyPoints(s.balance)+"</strong></td><td>"+moneyPoints(s.totalEarned)+"</td><td>"+(s.active===false?"Inaktiv":"Aktiv")+"</td><td><button class='btn secondary' onclick=\"rewardsResetPin('"+escHtml(s.studentCode||"")+"')\" "+(!s.studentCode?"disabled":"")+">PIN zurücksetzen</button></td></tr>"),"Noch keine Schüler angelegt. / لم تتم إضافة طلاب بعد.")+"</section>";
  }
  function renderCatalogue() {
    return "<section class='card'><h2>Belohnung hinzufügen / إضافة مكافأة</h2><div class='field-row'><div class='field'><label>Name Deutsch</label><input id='rwRewardName' maxlength='100'></div><div class='field'><label>الاسم بالعربية</label><input id='rwRewardNameAr' class='lang-ar' dir='rtl' maxlength='100'></div></div>" +
      "<div class='field-row'><div class='field'><label>Beschreibung Deutsch</label><input id='rwRewardDesc' maxlength='300'></div><div class='field'><label>الوصف بالعربية</label><input id='rwRewardDescAr' class='lang-ar' dir='rtl' maxlength='300'></div></div>" +
      "<div class='field-row'><div class='field'><label>Punktkosten / تكلفة النقاط</label><input id='rwRewardCost' type='number' min='1' step='1'></div><div class='field'><label>Symbol / رمز</label><input id='rwRewardEmoji' maxlength='8' value='🎁'></div></div><button class='btn' onclick='rewardsSaveReward()'>Belohnung speichern / حفظ المكافأة</button></section>" +
      "<section class='card'><h2>Belohnungskatalog / قائمة المكافآت</h2>"+table(["Belohnung","Beschreibung","Kosten","Status","Aktion"],cache.rewards.map(r=>"<tr><td><strong>"+escHtml(r.emoji||"🎁")+" "+escHtml(r.name||"")+"</strong><br><span class='lang-ar' dir='rtl'>"+escHtml(r.nameAr||"")+"</span></td><td>"+escHtml(r.description||"")+"<br><span class='lang-ar' dir='rtl'>"+escHtml(r.descriptionAr||"")+"</span></td><td>"+moneyPoints(r.cost)+"</td><td>"+(r.active===true?"Aktiv":"Inaktiv")+"</td><td><button class='btn secondary' onclick=\"rewardsEditReward('"+escHtml(r.id)+"')\">Bearbeiten</button> <button class='btn "+(r.active===true?"danger":"success")+"' onclick=\"rewardsToggleReward('"+escHtml(r.id)+"')\">"+(r.active===true?"Deaktivieren":"Aktivieren")+"</button></td></tr>"),"Noch keine Belohnungen angelegt. / لم تتم إضافة مكافآت بعد.")+"</section>";
  }
  function renderRedemptions() {
    return "<section class='card'><h2>Einlösungsanfragen / طلبات الاستبدال</h2>"+table(["Schüler","Belohnung","Punkte","Status","Angefragt","Aktion"],cache.redemptions.map(r=>"<tr><td>"+escHtml(r.studentName||r.studentUid)+"</td><td>"+escHtml(r.rewardName||r.rewardId)+"</td><td>"+moneyPoints(r.cost)+"</td><td>"+escHtml(r.status||"pending")+"</td><td>"+fmtDate(r.createdAt)+"</td><td>"+(r.status==="pending"?"<button class='btn success' onclick=\"rewardsReview('"+escHtml(r.id)+"','approve')\">Genehmigen</button> <button class='btn danger' onclick=\"rewardsReview('"+escHtml(r.id)+"','reject')\">Ablehnen</button>":"—")+"</td></tr>"),"Keine Einlösungen vorhanden. / لا توجد طلبات استبدال.")+"</section>";
  }
  function renderTransactions() {
    return "<section class='card'><h2>Punkteverlauf / سجل النقاط</h2>"+table(["Datum","Schüler","Typ","Änderung","Beschreibung"],cache.transactions.map(t=>"<tr><td>"+fmtDate(t.createdAt)+"</td><td>"+escHtml(t.studentName||t.studentUid||"")+"</td><td>"+escHtml(t.type||"")+"</td><td>"+(Number(t.delta)>0?"+":"")+moneySigned(t.delta)+"</td><td>"+escHtml(t.description||t.reason||t.rewardName||"")+"</td></tr>"),"Noch keine Punkttransaktionen. / لا توجد معاملات نقاط بعد.")+"</section>";
  }
  function moneySigned(value) { return String(Math.round(Number(value)||0)); }
  function renderTab() {
    const el = $("rewardsContent"); if (!el) return;
    el.innerHTML = activeTab==="overview" ? renderOverview() : activeTab==="students" ? renderStudents() : activeTab==="catalogue" ? renderCatalogue() : activeTab==="redemptions" ? renderRedemptions() : renderTransactions();
    if (message) say(message);
  }
  async function refresh() {
    if (busy) return;
    busy = true; renderShell(); say("Daten werden geladen… / جارٍ تحميل البيانات…");
    try {
      const service = await api();
      cache = await service.loadRewardsTeacherData();
      renderTab(); say(message || "Daten aktualisiert. / تم تحديث البيانات.");
    } catch (e) { say(String(e && e.message || "Rewards konnten nicht geladen werden."), true); }
    finally { busy = false; }
  }
  window.rewardsDashboard = async function () {
    if (!window.isTeacher || !window.isTeacher()) { if (window.teacherLogin) window.teacherLogin(); return; }
    activeTab = "overview"; await refresh();
  };
  window.rewardsTab = function (tab) { activeTab = ["overview","students","catalogue","redemptions","transactions"].includes(tab)?tab:"overview"; renderShell(); renderTab(); };
  window.rewardsRefresh = refresh;
  window.rewardsCreateStudent = async function () {
    try {
      const service = await api();
      const data = { displayName: $("rwName").value.trim(), classId: $("rwClass").value, studentCode: $("rwCode").value.trim().toUpperCase(), pin: $("rwPin").value };
      if (!data.displayName || !data.studentCode || !data.pin) throw new Error("Bitte alle Felder ausfüllen. / يرجى ملء جميع الحقول.");
      const result = await service.createRewardStudent(data);
      message = "Schüler erstellt. Code: "+result.studentCode+" — bitte sicher an die Familie übergeben. / تم إنشاء الطالب.";
      activeTab = "students"; await refresh();
    } catch(e) { say(String(e.message||e),true); }
  };
  window.rewardsResetPin = async function (code) {
    if (!code) return;
    const pin = prompt("Neue PIN (4–10 Ziffern) / الرقم السري الجديد");
    if (pin === null) return;
    try { const service=await api(); await service.resetRewardStudentPin({studentCode:code,newPin:pin}); message="PIN zurückgesetzt. / تم تغيير الرقم السري."; await refresh(); }
    catch(e) { say(String(e.message||e),true); }
  };
  window.rewardsSaveReward = async function () {
    try {
      const service=await api();
      const item={name:$("rwRewardName").value.trim(),nameAr:$("rwRewardNameAr").value.trim(),description:$("rwRewardDesc").value.trim(),descriptionAr:$("rwRewardDescAr").value.trim(),cost:Number($("rwRewardCost").value),emoji:$("rwRewardEmoji").value.trim()||"🎁",active:true};
      if(!item.name||!item.nameAr||!Number.isInteger(item.cost)||item.cost<1) throw new Error("Name in beiden Sprachen und positive ganze Punktkosten erforderlich.");
      const id=$("rwRewardName").dataset.editId;
      await service.saveReward(item,id||null); message="Belohnung gespeichert. / تم حفظ المكافأة."; activeTab="catalogue"; await refresh();
    } catch(e) { say(String(e.message||e),true); }
  };
  window.rewardsEditReward = function (id) {
    const r=cache.rewards.find(x=>x.id===id); if(!r)return;
    activeTab="catalogue"; renderShell(); renderTab();
    $("rwRewardName").value=r.name||""; $("rwRewardName").dataset.editId=id;
    $("rwRewardNameAr").value=r.nameAr||""; $("rwRewardDesc").value=r.description||""; $("rwRewardDescAr").value=r.descriptionAr||"";
    $("rwRewardCost").value=r.cost||""; $("rwRewardEmoji").value=r.emoji||"🎁";
    window.scrollTo({top:0,behavior:"smooth"});
  };
  window.rewardsToggleReward = async function(id) {
    try { const r=cache.rewards.find(x=>x.id===id); if(!r)return; const service=await api(); await service.saveReward({active:r.active!==true},id); message="Status aktualisiert. / تم تحديث الحالة."; await refresh(); }
    catch(e){say(String(e.message||e),true);}
  };
  window.rewardsReview = async function(id,decision) {
    if (decision==="approve" && !confirm("Einlösung genehmigen und Punkte abziehen? / الموافقة وخصم النقاط؟")) return;
    try { const service=await api(); await service.reviewRewardRedemption({redemptionId:id,decision}); message=decision==="approve"?"Einlösung genehmigt. / تمت الموافقة.":"Einlösung abgelehnt. / تم الرفض."; await refresh(); }
    catch(e){say(String(e.message||e),true);}
  };
  // Extend the teacher area selector after the existing page has rendered.
  const originalRoute = window.bibleEscapeRouteTeacherDashboard;
  if (typeof originalRoute === "function") {
    window.bibleEscapeRouteTeacherDashboard = function () {
      originalRoute();
      if (window.state && state.teacherSection === "escape") return;
      const grid = document.querySelector(".activity-mode-grid");
      if (grid && !document.getElementById("rewardsModeCard")) {
        const card=document.createElement("article"); card.id="rewardsModeCard"; card.className="card activity-mode-card";
        card.innerHTML="<div class='activity-mode-icon'>🎁</div><div class='activity-mode-kicker'>PUNKTE & BELOHNUNGEN / النقاط والمكافآت</div><h2>Ava Kerolos Rewards</h2><p>Schülerkonten, Punktestände, Belohnungen und Einlösungen verwalten. / إدارة حسابات الطلاب والنقاط والمكافآت.</p><button class='btn' onclick='rewardsDashboard()'>Rewards öffnen / فتح المكافآت →</button>";
        grid.appendChild(card);
      }
    };
  }
})();