// ==========================================
// ARQUIVO: script.js (VERSÃO FINAL + AGENDAMENTO)
// ==========================================

const APP_KEY = 'joaoPDV_v2'; 
let DB = {
    products: [],
    sales: [],
    expenses: [],
    appointments: [], // Novo Array de Agendamentos
    cashier: {
        isOpen: false,
        openTime: null,
        initialValue: 0,
        history: []
    }
};

let cart = [];
let currentPaymentMethod = '';
// Filtros de Data
let filterStart = new Date().toISOString().split('T')[0];
let filterEnd = new Date().toISOString().split('T')[0];

document.addEventListener('DOMContentLoaded', () => {
    loadData();
    if (typeof lucide !== 'undefined') lucide.createIcons();
    setupEventListeners();
    renderProducts();
    updateCashierUI();
    
    // Configura datas iniciais
    const today = new Date();
    const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
    document.getElementById('filterStartDate').value = firstDay.toISOString().split('T')[0];
    document.getElementById('filterEndDate').value = today.toISOString().split('T')[0];
    
    // Renderiza agenda se estiver na tela
    if(!document.getElementById('section-scheduling').classList.contains('hidden')) renderAppointments();
});

function loadData() {
    const raw = localStorage.getItem(APP_KEY);
    if (raw) {
        try {
            const data = JSON.parse(raw);
            DB.products = data.products || [];
            DB.sales = data.sales || [];
            DB.expenses = data.expenses || [];
            DB.appointments = data.appointments || []; // Garante inicialização
            DB.cashier = data.cashier || { isOpen: false, initialValue: 0, history: [] };
        } catch (e) {
            console.error("Erro ao carregar dados:", e);
        }
    }
}

function saveData() {
    localStorage.setItem(APP_KEY, JSON.stringify(DB));
}

// --- FUNÇÕES DE CÁLCULO PDV ---
window.calculatePrice = function(localId, pricePerKg) {
    const weightInput = document.getElementById(`qtd-${localId}`);
    const moneyInput = document.getElementById(`money-${localId}`);
    const grams = parseFloat(weightInput.value);
    if (!grams) { moneyInput.value = ''; return; }
    const total = (grams / 1000) * pricePerKg;
    moneyInput.value = total.toFixed(2);
};

window.calculateWeight = function(localId, pricePerKg) {
    const weightInput = document.getElementById(`qtd-${localId}`);
    const moneyInput = document.getElementById(`money-${localId}`);
    const money = parseFloat(moneyInput.value);
    if (!money) { weightInput.value = ''; return; }
    const grams = (money / pricePerKg) * 1000;
    weightInput.value = Math.round(grams);
};

window.updateUnitPreview = function(localId, pricePerUnit) {
    const qtdInput = document.getElementById(`qtd-${localId}`);
    const previewEl = document.getElementById(`preview-${localId}`);
    const qtd = parseFloat(qtdInput.value) || 0;
    if (qtd > 0) {
        previewEl.textContent = formatMoney(qtd * pricePerUnit);
        previewEl.classList.remove('hidden');
    } else {
        previewEl.classList.add('hidden');
    }
};

// --- IMPORTAÇÃO E EXPORTAÇÃO ---
function exportData() {
    // Como DB.appointments já faz parte do objeto DB, ele é exportado automaticamente aqui
    const dataStr = JSON.stringify(DB, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `BACKUP_NATURALLE_${new Date().toISOString().slice(0,10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
}

function exportReport() {
    if(DB.sales.length === 0 && DB.expenses.length === 0) return alert("Sem dados.");
    
    filterStart = document.getElementById('filterStartDate').value;
    filterEnd = document.getElementById('filterEndDate').value;
    
    const salesF = DB.sales.filter(s => isDateInRange(s.date));
    const expensesF = DB.expenses.filter(e => isDateInRange(e.date));
    
    let csvContent = "DATA;TIPO;CATEGORIA;DESCRICAO;VALOR_ENTRADA;VALOR_SAIDA\n";
    
    salesF.forEach(s => {
        csvContent += `${new Date(s.date).toLocaleString()};VENDA;Vendas;Venda (${s.items.length} itens);${s.total.toFixed(2).replace('.',',')};0\n`;
    });
    expensesF.forEach(e => {
        csvContent += `${new Date(e.date).toLocaleString()};DESPESA;${e.category||'Geral'};${e.desc};0;${e.value.toFixed(2).replace('.',',')}\n`;
    });

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `RELATORIO_FINANCEIRO_${filterStart}_${filterEnd}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
}

async function importData(event) {
    const file = event.target.files[0];
    if (!file) return;
    try {
        const text = await file.text();
        const json = JSON.parse(text);
        if(confirm("Restaurar backup completo? Isso substitui os dados atuais.")) {
            DB = json;
            if(!DB.sales) DB.sales = [];
            if(!DB.expenses) DB.expenses = [];
            if(!DB.appointments) DB.appointments = []; // Inicializa se não existir no backup antigo
            if(!DB.cashier) DB.cashier = { isOpen: false, initialValue: 0, history: [] };
            alert("Backup restaurado.");
            saveData();
            renderProducts();
            if(!document.getElementById('section-scheduling').classList.contains('hidden')) renderAppointments();
            if(!document.getElementById('section-finance').classList.contains('hidden')) applyFinanceFilter();
        }
        event.target.value = '';
    } catch (error) {
        alert("Erro no arquivo: " + error.message);
    }
}

// --- GESTÃO DE PRODUTOS ---
function handleSaveProduct(e) {
    e.preventDefault();
    const id = document.getElementById('productId').value;
    const name = document.getElementById('productName').value;
    const price = parseFloat(document.getElementById('productPrecoVendaKg').value);
    const cost = parseFloat(document.getElementById('productPrecoCompraKg').value) || 0;
    const stock = parseFloat(document.getElementById('productPeso').value);
    const oldPrice = parseFloat(document.getElementById('productPrecoAntigoKg').value) || 0;
    const localId = document.getElementById('localId').value;

    const prod = { id, nome: name, precoVendaKg: price, precoCompraKg: cost, peso: stock, precoAntigoKg: oldPrice };

    if (localId) {
        const idx = DB.products.findIndex(p => p.localId === localId);
        if (idx !== -1) DB.products[idx] = { ...prod, localId };
    } else {
        DB.products.push({ ...prod, localId: crypto.randomUUID() });
    }
    saveData();
    renderProducts();
    renderInventoryTable();
    document.getElementById('productModal').classList.add('hidden');
    document.getElementById('productForm').reset();
}

window.editProduct = function(localId) {
    const p = DB.products.find(x => x.localId === localId);
    if (!p) return;
    document.getElementById('modalTitle').textContent = "Editar Produto";
    document.getElementById('localId').value = p.localId;
    document.getElementById('productId').value = p.id;
    document.getElementById('productName').value = p.nome;
    document.getElementById('productPrecoVendaKg').value = p.precoVendaKg;
    document.getElementById('productPrecoCompraKg').value = p.precoCompraKg;
    document.getElementById('productPeso').value = p.peso;
    document.getElementById('productPrecoAntigoKg').value = p.precoAntigoKg || 0;
    document.getElementById('productModal').classList.remove('hidden');
};

window.deleteProduct = function(id) {
    if(confirm("Excluir produto?")) {
        DB.products = DB.products.filter(p => p.localId !== id);
        saveData();
        renderInventoryTable();
        renderProducts();
    }
};

function renderInventoryTable() {
    const tbody = document.getElementById('inventoryTableBody');
    const searchInput = document.getElementById('inventorySearch');
    const term = searchInput ? searchInput.value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "") : "";
    tbody.innerHTML = '';
    const filtered = DB.products.filter(p => p.nome.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").includes(term) || p.id.toLowerCase().includes(term));

    if(filtered.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" class="text-center py-8 text-gray-500">Nada encontrado.</td></tr>`;
        return;
    }
    filtered.forEach(p => {
        const tr = document.createElement('tr');
        tr.className = "bg-white hover:bg-gray-50 border-b transition-colors";
        const unit = p.id.startsWith('AGR') ? 'kg' : 'un';
        tr.innerHTML = `
            <td class="px-6 py-4 font-medium text-gray-900">${p.nome} <br><span class="text-xs text-gray-400 font-mono bg-gray-50 px-1 rounded">${p.id}</span></td>
            <td class="px-6 py-4 text-blue-600 font-medium">${formatMoney(p.precoVendaKg)}</td>
            <td class="px-6 py-4 text-gray-500">${formatMoney(p.precoCompraKg)}</td>
            <td class="px-6 py-4 ${p.peso<=2?'text-red-600 font-bold bg-red-50 rounded':''}">${p.peso.toFixed(3)} ${unit}</td>
            <td class="px-6 py-4 text-center">
                <button onclick="editProduct('${p.localId}')" class="text-blue-600 hover:bg-blue-50 p-2 rounded mr-2 transition"><i data-lucide="edit-2" class="w-4 h-4"></i></button>
                <button onclick="deleteProduct('${p.localId}')" class="text-red-600 hover:bg-red-50 p-2 rounded transition"><i data-lucide="trash-2" class="w-4 h-4"></i></button>
            </td>
        `;
        tbody.appendChild(tr);
    });
    if (typeof lucide !== 'undefined') lucide.createIcons();
}

// --- SISTEMA DE AGENDAMENTO (NOVO) ---
window.openAppointmentModal = function(id = null) {
    const form = document.getElementById('appointmentForm');
    form.reset();
    document.getElementById('appointId').value = '';
    
    if(id) {
        const app = DB.appointments.find(a => a.id === id);
        if(app) {
            document.getElementById('appointId').value = app.id;
            document.getElementById('appointDate').value = app.date;
            document.getElementById('appointTime').value = app.time;
            document.getElementById('appointPatient').value = app.patient;
            document.getElementById('appointType').value = app.type;
            document.getElementById('appointObs').value = app.obs;
        }
    } else {
        // Data padrão: hoje
        document.getElementById('appointDate').value = new Date().toISOString().split('T')[0];
    }
    document.getElementById('appointmentModal').classList.remove('hidden');
};

window.handleSaveAppointment = function(e) {
    e.preventDefault();
    const id = document.getElementById('appointId').value;
    const date = document.getElementById('appointDate').value;
    const time = document.getElementById('appointTime').value;
    const patient = document.getElementById('appointPatient').value;
    const type = document.getElementById('appointType').value;
    const obs = document.getElementById('appointObs').value;

    const appData = { 
        id: id || crypto.randomUUID(), 
        date, time, patient, type, obs, 
        status: id ? DB.appointments.find(a=>a.id===id).status : 'scheduled' // Mantém status se editando
    };

    if(id) {
        const idx = DB.appointments.findIndex(a => a.id === id);
        if(idx !== -1) DB.appointments[idx] = appData;
    } else {
        DB.appointments.push(appData);
    }

    saveData();
    renderAppointments();
    document.getElementById('appointmentModal').classList.add('hidden');
};

window.toggleAppointStatus = function(id) {
    const idx = DB.appointments.findIndex(a => a.id === id);
    if(idx === -1) return;
    
    const current = DB.appointments[idx].status;
    // Ciclo: scheduled -> done -> cancelled -> scheduled
    let next = 'scheduled';
    if(current === 'scheduled') next = 'done';
    else if(current === 'done') next = 'cancelled';
    else if(current === 'cancelled') next = 'scheduled';
    
    DB.appointments[idx].status = next;
    saveData();
    renderAppointments();
};

window.deleteAppointment = function(id) {
    if(!confirm("Excluir agendamento?")) return;
    DB.appointments = DB.appointments.filter(a => a.id !== id);
    saveData();
    renderAppointments();
};

window.renderAppointments = function() {
    const tbody = document.getElementById('scheduleTableBody');
    tbody.innerHTML = '';

    // Ordenar por Data e Hora
    const sorted = [...DB.appointments].sort((a,b) => {
        const da = new Date(`${a.date}T${a.time}`);
        const db = new Date(`${b.date}T${b.time}`);
        return da - db;
    });

    if(sorted.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" class="text-center py-8 text-gray-500">Nenhuma consulta agendada.</td></tr>`;
        return;
    }

    sorted.forEach(app => {
        const tr = document.createElement('tr');
        tr.className = "hover:bg-gray-50 border-b transition";
        
        // Estilos de Status
        let statusHtml = '';
        let rowClass = '';
        if(app.status === 'scheduled') {
            statusHtml = `<span class="bg-blue-100 text-blue-700 px-2 py-1 rounded text-xs font-bold">Agendado</span>`;
        } else if(app.status === 'done') {
            statusHtml = `<span class="bg-green-100 text-green-700 px-2 py-1 rounded text-xs font-bold">Concluído</span>`;
            rowClass = 'opacity-60 bg-gray-50'; // Visualmente "arquivado"
        } else {
            statusHtml = `<span class="bg-red-100 text-red-700 px-2 py-1 rounded text-xs font-bold">Cancelado</span>`;
            rowClass = 'opacity-50 line-through decoration-gray-400';
        }

        const dateFormatted = new Date(app.date + 'T12:00:00').toLocaleDateString(); // Hack para timezone simples

        tr.innerHTML = `
            <td class="px-6 py-4 font-mono text-gray-600 ${rowClass}">${dateFormatted} <br> <span class="font-bold text-gray-800">${app.time}</span></td>
            <td class="px-6 py-4 font-medium text-gray-900 ${rowClass}">${app.patient}</td>
            <td class="px-6 py-4 text-gray-600 ${rowClass}">${app.type}</td>
            <td class="px-6 py-4 text-gray-500 text-xs italic ${rowClass}">${app.obs || '-'}</td>
            <td class="px-6 py-4 text-center cursor-pointer select-none" onclick="toggleAppointStatus('${app.id}')" title="Clique para alterar status">${statusHtml}</td>
            <td class="px-6 py-4 text-center">
                <button onclick="openAppointmentModal('${app.id}')" class="text-blue-600 hover:bg-blue-50 p-2 rounded mr-1 transition"><i data-lucide="edit-2" class="w-4 h-4"></i></button>
                <button onclick="deleteAppointment('${app.id}')" class="text-red-600 hover:bg-red-50 p-2 rounded transition"><i data-lucide="trash-2" class="w-4 h-4"></i></button>
            </td>
        `;
        tbody.appendChild(tr);
    });
    if (typeof lucide !== 'undefined') lucide.createIcons();
};


// --- SISTEMA FINANCEIRO ---
window.applyFinanceFilter = function() {
    filterStart = document.getElementById('filterStartDate').value;
    filterEnd = document.getElementById('filterEndDate').value;
    if(!filterStart || !filterEnd) return alert("Selecione as datas.");
    updateProfessionalFinance();
    document.getElementById('periodBadge').textContent = `${new Date(filterStart).toLocaleDateString()} até ${new Date(filterEnd).toLocaleDateString()}`;
};

function isDateInRange(dateStr) {
    const d = new Date(dateStr).toISOString().split('T')[0];
    return d >= filterStart && d <= filterEnd;
}

function updateProfessionalFinance() {
    const salesFiltered = DB.sales.filter(s => isDateInRange(s.date));
    const expensesFiltered = DB.expenses.filter(e => isDateInRange(e.date));

    const revenue = salesFiltered.reduce((acc, s) => acc + s.total, 0);
    const costOfGoods = salesFiltered.reduce((acc, s) => acc + (s.cost || 0), 0);
    const grossProfit = revenue - costOfGoods;
    const totalExpenses = expensesFiltered.reduce((acc, e) => acc + e.value, 0);
    const netProfit = grossProfit - totalExpenses;

    document.getElementById('dreRevenue').textContent = formatMoney(revenue);
    document.getElementById('dreCMV').textContent = `(${formatMoney(costOfGoods)})`;
    document.getElementById('dreGrossProfit').textContent = formatMoney(grossProfit);
    document.getElementById('dreExpenses').textContent = `(${formatMoney(totalExpenses)})`;
    
    const netEl = document.getElementById('dreNetProfit');
    netEl.textContent = formatMoney(netProfit);
    netEl.className = `text-2xl font-bold ${netProfit >= 0 ? 'text-green-500' : 'text-red-500'}`;

    const margin = revenue > 0 ? ((netProfit / revenue) * 100).toFixed(1) : 0;
    const ticket = salesFiltered.length > 0 ? (revenue / salesFiltered.length) : 0;
    
    document.getElementById('kpiMargin').textContent = `${margin}%`;
    document.getElementById('kpiTicket').textContent = formatMoney(ticket);

    renderCategoryChart(expensesFiltered, totalExpenses);
    renderFinanceTable(salesFiltered, expensesFiltered);
}

function renderCategoryChart(expenses, totalVal) {
    const container = document.getElementById('expensesChart');
    container.innerHTML = '';
    if(expenses.length === 0) {
        container.innerHTML = '<p class="text-xs text-gray-400 text-center py-4">Sem despesas no período.</p>';
        return;
    }
    const cats = {};
    expenses.forEach(e => { const c = e.category || 'Outros'; if(!cats[c]) cats[c] = 0; cats[c] += e.value; });

    Object.entries(cats).sort((a,b) => b[1] - a[1]).forEach(([cat, val]) => {
        const pct = totalVal > 0 ? (val / totalVal) * 100 : 0;
        const colorClass = getCategoryColor(cat);
        const div = document.createElement('div');
        div.innerHTML = `
            <div class="flex justify-between text-xs mb-1">
                <span class="font-bold text-gray-600">${cat}</span>
                <span class="text-gray-500">${formatMoney(val)} (${pct.toFixed(0)}%)</span>
            </div>
            <div class="w-full bg-gray-100 rounded-full h-2">
                <div class="h-2 rounded-full ${colorClass}" style="width: ${pct}%"></div>
            </div>
        `;
        container.appendChild(div);
    });
}

function getCategoryColor(cat) {
    const map = { 'Operacional': 'bg-blue-500', 'Fornecedores': 'bg-orange-500', 'Marketing': 'bg-purple-500', 'Funcionarios': 'bg-yellow-500', 'Impostos': 'bg-red-500', 'Retirada': 'bg-green-500' };
    return map[cat] || 'bg-gray-400';
}

function renderFinanceTable(sales, expenses) {
    const tbody = document.getElementById('financeTableBody');
    tbody.innerHTML = '';
    let items = [];
    sales.forEach(s => items.push({ date: s.date, type: 'VENDA', desc: `Venda (${s.items.length} itens)`, in: s.total, out: 0, cat: 'Vendas', id: s.id }));
    expenses.forEach(e => items.push({ date: e.date, type: 'DESPESA', desc: e.desc, in: 0, out: e.value, cat: e.category || 'Geral', id: e.id }));
    items.sort((a, b) => new Date(b.date) - new Date(a.date));

    items.forEach(item => {
        const tr = document.createElement('tr');
        tr.className = "hover:bg-gray-50 border-b transition";
        tr.innerHTML = `
            <td class="px-4 py-3 text-gray-500 text-xs">${new Date(item.date).toLocaleDateString()}</td>
            <td class="px-4 py-3"><span class="text-[10px] uppercase font-bold px-2 py-1 rounded bg-gray-100 text-gray-600">${item.cat}</span></td>
            <td class="px-4 py-3 text-gray-800 font-medium">${item.desc}</td>
            <td class="px-4 py-3 text-right text-green-600 font-mono">${item.in > 0 ? formatMoney(item.in) : '-'}</td>
            <td class="px-4 py-3 text-right text-red-600 font-mono">${item.out > 0 ? formatMoney(item.out) : '-'}</td>
            <td class="px-4 py-3 text-center">
                <button onclick="deleteTransaction('${item.type}', '${item.id}')" class="text-gray-300 hover:text-red-500 transition"><i data-lucide="trash-2" class="w-4 h-4"></i></button>
            </td>
        `;
        tbody.appendChild(tr);
    });
    if(typeof lucide !== 'undefined') lucide.createIcons();
}

window.deleteTransaction = function(type, id) {
    if(!confirm("Apagar registro financeiro?")) return;
    if (type === 'VENDA') DB.sales = DB.sales.filter(s => s.id !== id);
    else if (type === 'DESPESA') DB.expenses = DB.expenses.filter(e => e.id !== id);
    saveData();
    applyFinanceFilter();
};

window.saveExpense = function() {
    const d = document.getElementById('expenseDesc').value;
    const v = parseFloat(document.getElementById('expenseValue').value);
    const c = document.getElementById('expenseCategory').value;
    if (!d || !v) return alert("Preencha tudo.");
    DB.expenses.push({ id: crypto.randomUUID(), date: new Date().toISOString(), desc: d, value: v, category: c });
    saveData();
    document.getElementById('expenseModal').classList.add('hidden');
    document.getElementById('expenseDesc').value='';
    document.getElementById('expenseValue').value='';
    applyFinanceFilter();
};

// --- CAIXA ---
window.confirmOpenCashier = function() {
    const val = parseFloat(document.getElementById('initialFloat').value) || 0;
    DB.cashier.isOpen = true;
    DB.cashier.openTime = new Date().toISOString();
    DB.cashier.initialValue = val;
    DB.cashier.history.push({ id: crypto.randomUUID(), type: 'ABERTURA', desc: 'Abertura de Caixa', val: val, method: 'Dinheiro', date: new Date().toISOString() });
    saveData();
    document.getElementById('cashierModal').classList.add('hidden');
    updateCashierUI();
};

function closeCashier() {
    if(!confirm("Fechar caixa?")) return;
    const openTime = new Date(DB.cashier.openTime);
    const cashSales = DB.sales.filter(s => new Date(s.date) > openTime && s.method === 'dinheiro').reduce((acc,s)=>acc+s.total,0);
    const exp = DB.expenses.filter(e => new Date(e.date) > openTime).reduce((acc,e)=>acc+e.value,0);
    const final = DB.cashier.initialValue + cashSales - exp;

    DB.cashier.history.push({ id: crypto.randomUUID(), type: 'FECHAMENTO', desc: `Fechamento (Gaveta: ${formatMoney(final)})`, val: final, method: 'Dinheiro', date: new Date().toISOString() });
    DB.cashier.isOpen = false;
    saveData();
    updateCashierUI();
    alert(`Caixa fechado. Valor final: ${formatMoney(final)}`);
}

function updateCashierUI() {
    const st = document.getElementById('cashierStatus');
    const open = document.getElementById('btnOpenCashier');
    const close = document.getElementById('btnCloseCashier');
    if(DB.cashier.isOpen) {
        st.innerHTML = `<i data-lucide="unlock" class="w-4 h-4 mr-2"></i> Aberto`;
        st.className = "bg-green-100 text-green-700 px-4 py-3 rounded-lg text-sm font-semibold flex items-center justify-center";
        open.classList.add('hidden'); close.classList.remove('hidden');
    } else {
        st.innerHTML = `<i data-lucide="lock" class="w-4 h-4 mr-2"></i> Fechado`;
        st.className = "bg-red-100 text-red-700 px-4 py-3 rounded-lg text-sm font-semibold flex items-center justify-center";
        open.classList.remove('hidden'); close.classList.add('hidden');
    }
    if (typeof lucide !== 'undefined') lucide.createIcons();
}

// --- RENDERIZAÇÃO PDV ---
function renderProducts() {
    const grid = document.getElementById('productGrid');
    const term = document.getElementById('searchInput').value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    const activeTab = document.querySelector('.tab-filter.active')?.dataset.tab || 'granel';
    grid.innerHTML = '';
    
    const filtered = DB.products.filter(p => {
        const n = p.nome.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        const matchS = n.includes(term) || p.id.toLowerCase().includes(term);
        const isAGR = p.id.startsWith('AGR');
        const matchT = (activeTab === 'granel' && isAGR) || (activeTab === 'outros' && !isAGR);
        return matchS && matchT;
    });

    if (filtered.length === 0) { document.getElementById('noResults').classList.remove('hidden'); return; }
    document.getElementById('noResults').classList.add('hidden');

    filtered.forEach(p => {
        const isAGR = p.id.startsWith('AGR');
        const unit = isAGR ? 'kg' : 'un';
        const lowStock = p.peso <= (isAGR ? 1 : 5);
        const stockClass = lowStock ? 'text-red-600 font-bold' : 'text-gray-400';
        
        const div = document.createElement('div');
        div.className = "bg-white p-5 rounded-xl shadow-sm border border-gray-100 hover:shadow-md hover:-translate-y-1 transition-all duration-300 flex flex-col group";
        
        let inputsHtml = '';
        if (isAGR) {
            inputsHtml = `
                <div class="flex space-x-2 mb-2">
                    <div class="w-1/2">
                        <label class="text-[10px] uppercase font-bold text-gray-400">Gramas</label>
                        <input type="number" id="qtd-${p.localId}" class="w-full bg-gray-50 border border-gray-200 rounded-lg px-2 py-2 text-sm focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none font-bold text-gray-700" placeholder="g" 
                            oninput="calculatePrice('${p.localId}', ${p.precoVendaKg})" onkeydown="if(event.key==='Enter') triggerAddToCart('${p.localId}')">
                    </div>
                    <div class="w-1/2">
                        <label class="text-[10px] uppercase font-bold text-green-600">Valor (R$)</label>
                        <input type="number" id="money-${p.localId}" class="w-full bg-green-50 border border-green-200 rounded-lg px-2 py-2 text-sm focus:bg-white focus:ring-2 focus:ring-green-500 outline-none font-bold text-green-700" placeholder="R$" 
                            oninput="calculateWeight('${p.localId}', ${p.precoVendaKg})" onkeydown="if(event.key==='Enter') triggerAddToCart('${p.localId}')">
                    </div>
                </div>
                <button onclick="triggerAddToCart('${p.localId}')" class="w-full bg-blue-600 text-white py-2 rounded-lg hover:bg-blue-700 font-medium text-sm shadow-sm active:scale-95 transition-all">Adicionar</button>
            `;
        } else {
            inputsHtml = `
                <div class="relative mb-2">
                    <label class="text-[10px] uppercase font-bold text-gray-400">Quantidade</label>
                    <div class="flex items-center">
                        <input type="number" id="qtd-${p.localId}" class="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none font-bold text-gray-700" placeholder="Qtd" 
                            oninput="updateUnitPreview('${p.localId}', ${p.precoVendaKg})" onkeydown="if(event.key==='Enter') triggerAddToCart('${p.localId}')">
                        <span id="preview-${p.localId}" class="hidden absolute right-3 top-8 text-xs font-bold text-blue-600 bg-blue-50 px-1 rounded shadow-sm border border-blue-100"></span>
                    </div>
                </div>
                <button onclick="triggerAddToCart('${p.localId}')" class="w-full bg-blue-600 text-white py-2 rounded-lg hover:bg-blue-700 font-medium text-sm shadow-sm active:scale-95 transition-all">Adicionar</button>
            `;
        }
        div.innerHTML = `
            <div class="flex justify-between mb-2 items-start">
                <h3 class="font-bold text-gray-800 line-clamp-2 text-sm group-hover:text-blue-600 transition-colors" title="${p.nome}">${p.nome}</h3>
                <span class="text-[10px] font-mono bg-gray-50 text-gray-500 px-1.5 py-0.5 rounded border border-gray-200 ml-1">${p.id}</span>
            </div>
            <div class="mt-auto">
                <div class="flex justify-between items-end mb-3">
                    <p class="text-blue-600 font-bold text-xl tracking-tight">${formatMoney(p.precoVendaKg)}<span class="text-xs text-gray-400 font-normal">/${unit}</span></p>
                    <p class="text-[10px] ${stockClass}">Est: ${p.peso.toFixed(3)}</p>
                </div>
                ${inputsHtml}
            </div>
        `;
        grid.appendChild(div);
    });
    if(typeof lucide !== 'undefined') lucide.createIcons();
}

window.triggerAddToCart = function(id) {
    const el = document.getElementById(`qtd-${id}`);
    const val = parseFloat(el.value);
    if(val > 0) { addToCart(id, val); el.value = ''; if(document.getElementById(`money-${id}`)) document.getElementById(`money-${id}`).value = ''; }
    else el.focus();
}

window.addToCart = function(productId, qtd) {
    if (!DB.cashier.isOpen) { alert("Caixa fechado!"); return; }
    const p = DB.products.find(x => x.localId === productId);
    if (!p) return;
    const isAGR = p.id.startsWith('AGR');
    const calcQtd = isAGR ? (qtd / 1000) : qtd; 
    const sub = p.precoVendaKg * calcQtd;

    cart.push({ ...p, sellQtdRaw: qtd, sellQtdCalc: calcQtd, sellSubtotal: sub, isGranel: isAGR });
    updateCartBadge();
    
    const btn = document.querySelector(`button[onclick*="${productId}"]`);
    if(btn) {
        const prev = btn.innerHTML; btn.innerHTML = 'OK'; btn.classList.add('bg-green-600');
        setTimeout(() => { btn.innerHTML = prev; btn.classList.remove('bg-green-600'); }, 700);
    }
};

window.openCart = function() {
    if(cart.length === 0) { alert("Vazio."); return; }
    const container = document.getElementById('checkoutItems'); 
    container.innerHTML = '';
    let total = 0;
    cart.forEach((item, index) => {
        total += item.sellSubtotal;
        const div = document.createElement('div');
        div.className = "flex justify-between items-center border-b border-gray-100 py-3 text-sm last:border-0 hover:bg-gray-50 transition-colors px-2 -mx-2 rounded";
        div.innerHTML = `
            <div class="flex-1">
                <span class="font-bold text-gray-800 block">${item.nome}</span>
                <span class="text-xs text-gray-500">${item.sellQtdRaw}${item.isGranel ? 'g' : 'un'} x ${formatMoney(item.precoVendaKg)}</span>
            </div>
            <div class="flex items-center space-x-3">
                <span class="font-bold text-blue-600">${formatMoney(item.sellSubtotal)}</span>
                <button onclick="removeFromCart(${index})" class="text-gray-400 hover:text-red-500 p-1 rounded-full hover:bg-red-50 transition-colors"><i data-lucide="trash-2" class="w-4 h-4"></i></button>
            </div>
        `;
        container.appendChild(div);
    });
    document.getElementById('checkoutTotal').textContent = formatMoney(total);
    document.getElementById('paymentModal').classList.remove('hidden');
    document.getElementById('confirmPaymentButton').disabled = true;
    document.getElementById('amountPaid').value = '';
    document.getElementById('changeValue').textContent = 'R$ 0,00';
    document.getElementById('changeArea').classList.add('hidden');
    currentPaymentMethod = '';
    document.querySelectorAll('.pay-method-btn').forEach(b => b.classList.remove('ring-2', 'border-blue-600', 'bg-blue-50'));
    if (typeof lucide !== 'undefined') lucide.createIcons();
};

window.removeFromCart = function(index) {
    cart.splice(index, 1);
    updateCartBadge();
    if (cart.length === 0) document.getElementById('paymentModal').classList.add('hidden');
    else openCart();
};

window.selectPayment = function(m) {
    currentPaymentMethod = m;
    document.querySelectorAll('.pay-method-btn').forEach(b => b.classList.remove('ring-2', 'border-blue-600', 'bg-blue-50'));
    document.getElementById(`btn-${m}`).classList.add('ring-2', 'border-blue-600', 'bg-blue-50');
    const btn = document.getElementById('confirmPaymentButton');
    if(m==='dinheiro') {
        document.getElementById('changeArea').classList.remove('hidden');
        btn.disabled = true; document.getElementById('amountPaid').focus();
    } else {
        document.getElementById('changeArea').classList.add('hidden');
        btn.disabled = false;
    }
};

document.getElementById('amountPaid').addEventListener('input', (e) => {
    const tot = cart.reduce((a,b)=>a+b.sellSubtotal,0);
    const pd = parseFloat(e.target.value);
    const btn = document.getElementById('confirmPaymentButton');
    if(pd >= tot - 0.05) {
        document.getElementById('changeValue').textContent = formatMoney(pd - tot);
        btn.disabled = false;
    } else {
        document.getElementById('changeValue').textContent = '...';
        btn.disabled = true;
    }
});

document.getElementById('confirmPaymentButton').addEventListener('click', () => {
    const tot = cart.reduce((a,b)=>a+b.sellSubtotal,0);
    const cost = cart.reduce((a,b)=>a+(b.precoCompraKg * b.sellQtdCalc),0);
    const sale = {
        id: crypto.randomUUID(), date: new Date().toISOString(),
        items: cart, total: tot, cost: cost, profit: tot - cost, method: currentPaymentMethod
    };
    DB.sales.push(sale);
    cart.forEach(c => {
        const idx = DB.products.findIndex(p => p.localId === c.localId);
        if(idx > -1) DB.products[idx].peso -= c.sellQtdCalc;
    });
    saveData();
    cart = []; updateCartBadge(); renderProducts();
    document.getElementById('paymentModal').classList.add('hidden');
    if(confirm("Imprimir cupom?")) downloadReceipt(sale);
    if(!document.getElementById('section-finance').classList.contains('hidden')) applyFinanceFilter();
});

// --- LISTENERS E NAVEGAÇÃO ---
window.showSection = function(id) {
    ['pos', 'products', 'finance', 'scheduling', 'settings'].forEach(x => { // Adicionado 'scheduling'
        document.getElementById(`section-${x}`).classList.add('hidden');
        const b = document.getElementById(`nav-${x}`); if(b) b.classList.remove('active-nav', 'bg-blue-50', 'text-blue-600');
    });
    document.getElementById(`section-${id}`).classList.remove('hidden');
    document.getElementById(`nav-${id}`).classList.add('active-nav', 'bg-blue-50', 'text-blue-600');
    if(id==='products') renderInventoryTable();
    if(id==='finance') applyFinanceFilter();
    if(id==='scheduling') renderAppointments(); // Renderiza agenda ao entrar
};

window.closePaymentModal = () => document.getElementById('paymentModal').classList.add('hidden');
window.resetSystem = () => { if(confirm("Apagar TUDO? Irreversível.")) { localStorage.removeItem(APP_KEY); location.reload(); } };

function setupEventListeners() {
    document.querySelectorAll('.tab-filter').forEach(b => b.addEventListener('click', (e) => {
        document.querySelectorAll('.tab-filter').forEach(x => x.classList.remove('active', 'bg-blue-100', 'text-blue-700'));
        e.target.classList.add('active', 'bg-blue-100', 'text-blue-700'); renderProducts();
    }));
    document.getElementById('searchInput').addEventListener('keyup', renderProducts);
    const invSearch = document.getElementById('inventorySearch');
    if(invSearch) invSearch.addEventListener('keyup', renderInventoryTable);
    document.getElementById('showCartButton').addEventListener('click', openCart);
    document.getElementById('importButton').addEventListener('click', () => document.getElementById('importFile').click());
    document.getElementById('importFile').addEventListener('change', importData);
    document.getElementById('exportButton').addEventListener('click', exportData);
    document.getElementById('addNewButton').addEventListener('click', () => {
        document.getElementById('productModal').classList.remove('hidden');
        document.getElementById('modalTitle').textContent = "Novo Produto";
        document.getElementById('productForm').reset(); document.getElementById('localId').value='';
    });
    document.getElementById('productForm').addEventListener('submit', handleSaveProduct);
    document.getElementById('appointmentForm').addEventListener('submit', handleSaveAppointment); // Listener Agenda
    document.getElementById('btnOpenCashier').addEventListener('click', () => document.getElementById('cashierModal').classList.remove('hidden'));
    document.getElementById('btnCloseCashier').addEventListener('click', closeCashier);
    document.getElementById('addExpenseButton').addEventListener('click', () => document.getElementById('expenseModal').classList.remove('hidden'));
    
    const btnImpTxt = document.getElementById('btnImportReceipts');
    const inpImpTxt = document.getElementById('importReceiptsFile');
    if(btnImpTxt && inpImpTxt) {
        btnImpTxt.addEventListener('click', () => inpImpTxt.click());
        inpImpTxt.addEventListener('change', handleOldReceiptsImport);
    }
}

function formatMoney(n) { return (n||0).toLocaleString('pt-BR', {style:'currency', currency:'BRL'}); }
function updateCartBadge() { const b=document.getElementById('cartItemCount'); b.textContent=cart.length; cart.length?b.classList.remove('hidden'):b.classList.add('hidden'); }
function downloadReceipt(sale) {
    let t = `*** CUPOM NATURALLE ***\nData: ${new Date(sale.date).toLocaleString()}\n----------------\n`;
    sale.items.forEach(i => t += `${i.nome}\n${i.sellQtdRaw}${i.isGranel?'g':'un'} x ${formatMoney(i.precoVendaKg)} = ${formatMoney(i.sellSubtotal)}\n`);
    t += `----------------\nTOTAL: ${formatMoney(sale.total)}`;
    const a=document.createElement('a'); a.href=URL.createObjectURL(new Blob([t],{type:'text/plain'})); a.download=`cupom.txt`; a.click();
}