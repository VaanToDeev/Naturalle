import time
from flask import Flask, request, render_template_string
from flask_sqlalchemy import SQLAlchemy

app = Flask(__name__)

# --- CONFIGURAÇÃO DO BANCO DE DADOS (SQLite) ---
# Cria o arquivo naturalle.db na pasta atual
app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///naturalle.db'
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

db = SQLAlchemy(app)

# --- MODELO (A Tabela no Banco) ---
class User(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False)
    email = db.Column(db.String(100), nullable=False)
    role = db.Column(db.String(50), nullable=False)
    status = db.Column(db.String(20), nullable=False)

# --- TEMPLATES HTML (Front-end) ---
# (Mantivemos a mesma estrutura visual, apenas adaptamos para objetos do banco)

BASE_TEMPLATE = """
<!DOCTYPE html>
<html lang="pt-br">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Sistema Naturalle</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <script src="https://unpkg.com/htmx.org@1.9.10"></script>
    <script src="https://unpkg.com/lucide@latest"></script>
    <style>
        tr.htmx-swapping td { opacity: 0; transition: opacity 1s ease-out; }
        .htmx-indicator { display:none; }
        .htmx-request .htmx-indicator { display:inline; }
    </style>
</head>
<body class="bg-gray-100 font-sans h-screen flex overflow-hidden">

    <aside class="w-64 bg-gray-900 text-white flex flex-col">
        <div class="p-6 text-xl font-bold flex items-center gap-2">
            <i data-lucide="layout-dashboard"></i> Naturalle Sys
        </div>
        <nav class="flex-1 px-4 space-y-2">
            <a href="/" class="flex items-center gap-3 px-4 py-3 bg-gray-800 rounded-lg text-white">
                <i data-lucide="users" class="w-5 h-5"></i> Equipe
            </a>
        </nav>
    </aside>

    <main class="flex-1 flex flex-col overflow-y-auto">
        <header class="bg-white border-b px-8 py-4 flex justify-between items-center sticky top-0 z-10">
            <h2 class="text-2xl font-bold text-gray-800">Gerenciamento de Equipe</h2>
        </header>

        <div class="p-8">
            <div class="bg-white p-4 rounded-lg shadow-sm border border-gray-200 mb-6 flex justify-between items-center">
                <div class="relative w-96">
                    <span class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <i data-lucide="search" class="w-4 h-4 text-gray-400"></i>
                    </span>
                    <input type="text" name="q"
                           class="pl-10 pr-4 py-2 border rounded-lg w-full focus:ring-2 focus:ring-blue-500 focus:outline-none transition"
                           placeholder="Buscar no banco de dados..."
                           hx-get="/search" 
                           hx-trigger="keyup changed delay:500ms" 
                           hx-target="#tbody-users" 
                           hx-indicator="#loading">
                </div>
                
                <div id="loading" class="htmx-indicator text-blue-600 text-sm font-medium flex items-center gap-2">
                    <i data-lucide="loader-2" class="w-4 h-4 animate-spin"></i> Buscando...
                </div>
                
                <button hx-post="/create_dummy" hx-target="#tbody-users" hx-swap="afterbegin"
                        class="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition flex items-center gap-2">
                    <i data-lucide="plus" class="w-4 h-4"></i> Adicionar Teste
                </button>
            </div>

            <div class="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
                <table class="w-full text-left border-collapse">
                    <thead class="bg-gray-50 text-gray-600 uppercase text-xs font-semibold">
                        <tr>
                            <th class="px-6 py-4">Nome</th>
                            <th class="px-6 py-4">Função</th>
                            <th class="px-6 py-4">Status</th>
                            <th class="px-6 py-4 text-right">Ações</th>
                        </tr>
                    </thead>
                    <tbody id="tbody-users" class="divide-y divide-gray-100">
                        {% for user in users %}
                            {{ row_template(user)|safe }}
                        {% endfor %}
                    </tbody>
                </table>
            </div>
        </div>
    </main>
    <script>lucide.createIcons();</script>
</body>
</html>
"""

ROW_TEMPLATE = """
<tr class="hover:bg-gray-50 transition group">
    <td class="px-6 py-4">
        <div class="flex items-center gap-3">
            <div class="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center text-xs font-bold text-gray-600">
                {{ user.name[0] }}
            </div>
            <div>
                <p class="font-medium text-gray-900">{{ user.name }}</p>
                <p class="text-gray-500 text-xs">{{ user.email }}</p>
            </div>
        </div>
    </td>
    <td class="px-6 py-4 text-sm text-gray-600">{{ user.role }}</td>
    <td class="px-6 py-4">
        {% if user.status == 'Ativo' %}
            <span class="px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-700">Ativo</span>
        {% elif user.status == 'Inativo' %}
            <span class="px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-700">Inativo</span>
        {% else %}
            <span class="px-2 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-700">{{ user.status }}</span>
        {% endif %}
    </td>
    <td class="px-6 py-4 text-right flex justify-end gap-2">
        <button hx-get="/edit/{{ user.id }}" hx-target="closest tr" hx-swap="outerHTML"
                class="p-1 text-gray-400 hover:text-blue-600 transition">
            <i data-lucide="pencil" class="w-4 h-4"></i>
        </button>
        <button hx-delete="/delete/{{ user.id }}" hx-confirm="Deletar {{ user.name }} do banco?" hx-target="closest tr" hx-swap="outerHTML swap:1s"
                class="p-1 text-gray-400 hover:text-red-600 transition">
            <i data-lucide="trash-2" class="w-4 h-4"></i>
        </button>
    </td>
    <script>lucide.createIcons();</script>
</tr>
"""

EDIT_TEMPLATE = """
<tr class="bg-blue-50 border-l-4 border-blue-500">
    <td class="px-6 py-4">
        <input type="text" name="name" value="{{ user.name }}" class="border p-1 rounded w-full text-sm">
        <input type="text" name="email" value="{{ user.email }}" class="border p-1 rounded w-full text-xs mt-1 text-gray-500">
    </td>
    <td class="px-6 py-4">
        <input type="text" name="role" value="{{ user.role }}" class="border p-1 rounded w-full text-sm">
    </td>
    <td class="px-6 py-4">
        <select name="status" class="border p-1 rounded text-sm w-full bg-white">
            <option value="Ativo" {% if user.status == 'Ativo' %}selected{% endif %}>Ativo</option>
            <option value="Inativo" {% if user.status == 'Inativo' %}selected{% endif %}>Inativo</option>
            <option value="Pendente" {% if user.status == 'Pendente' %}selected{% endif %}>Pendente</option>
        </select>
    </td>
    <td class="px-6 py-4 text-right flex justify-end gap-2">
        <button hx-post="/update/{{ user.id }}" hx-include="closest tr" hx-target="closest tr" hx-swap="outerHTML"
                class="bg-blue-600 text-white px-3 py-1 rounded text-xs font-bold hover:bg-blue-700">Salvar</button>
        <button hx-get="/cancel/{{ user.id }}" hx-target="closest tr" hx-swap="outerHTML"
                class="bg-gray-300 text-gray-700 px-3 py-1 rounded text-xs font-bold hover:bg-gray-400">Cancelar</button>
    </td>
</tr>
"""

# --- INICIALIZAÇÃO DO BANCO ---
def init_db():
    with app.app_context():
        db.create_all()
        # Se o banco estiver vazio, cria dados iniciais
        if not User.query.first():
            print("Criando dados de exemplo...")
            users = [
                User(name="João Victor", email="joao@naturalle.com", role="Admin", status="Ativo"),
                User(name="Maria Silva", email="maria@vendas.com", role="Vendas", status="Inativo"),
                User(name="Carlos Dev", email="carlos@tech.com", role="Dev", status="Ativo")
            ]
            db.session.add_all(users)
            db.session.commit()

# --- ROTAS ---

def render_row(user):
    return render_template_string(ROW_TEMPLATE, user=user)

@app.route('/')
def index():
    users = User.query.all() # SELECT * FROM user
    return render_template_string(BASE_TEMPLATE, users=users, row_template=render_row)

@app.route('/search')
def search():
    query = request.args.get('q', '')
    time.sleep(0.3) # Pequeno delay visual
    # Busca SQL usando LIKE
    if query:
        results = User.query.filter(
            (User.name.ilike(f'%{query}%')) | 
            (User.email.ilike(f'%{query}%'))
        ).all()
    else:
        results = User.query.all()
    
    html = "".join([render_row(u) for u in results])
    if not results:
        html = '<tr><td colspan="4" class="px-6 py-4 text-center text-gray-500">Nenhum registro no banco.</td></tr>'
    return html

@app.route('/create_dummy', methods=['POST'])
def create_dummy():
    # Atalho para criar usuário rápido e testar a tabela dinâmica
    new_user = User(name="Novo Usuário", email="novo@exemplo.com", role="Convidado", status="Pendente")
    db.session.add(new_user)
    db.session.commit()
    return render_row(new_user)

@app.route('/delete/<int:user_id>', methods=['DELETE'])
def delete_user(user_id):
    user = User.query.get_or_404(user_id)
    db.session.delete(user)
    db.session.commit()
    return ""

@app.route('/edit/<int:user_id>')
def edit_user(user_id):
    user = User.query.get_or_404(user_id)
    return render_template_string(EDIT_TEMPLATE, user=user)

@app.route('/cancel/<int:user_id>')
def cancel_edit(user_id):
    user = User.query.get_or_404(user_id)
    return render_row(user)

@app.route('/update/<int:user_id>', methods=['POST'])
def update_user(user_id):
    user = User.query.get_or_404(user_id)
    
    # Atualiza os campos
    user.name = request.form.get('name')
    user.email = request.form.get('email')
    user.role = request.form.get('role')
    user.status = request.form.get('status')
    
    db.session.commit() # Salva no SQLite
    return render_row(user)

if __name__ == '__main__':
    init_db() # Garante que o banco existe antes de rodar
    app.run(debug=True, port=5000)