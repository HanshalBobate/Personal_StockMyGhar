import os
import uuid
import base64
import json
from flask import Flask, render_template, request, jsonify
from flask_sqlalchemy import SQLAlchemy
from datetime import datetime

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
UPLOAD_FOLDER = os.path.join(BASE_DIR, 'static', 'uploads')
os.makedirs(UPLOAD_FOLDER, exist_ok=True)

app = Flask(__name__)
app.config['SQLALCHEMY_DATABASE_URI'] = f'sqlite:///{os.path.join(BASE_DIR, "stockmyghar.db")}'
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
app.config['MAX_CONTENT_LENGTH'] = 16 * 1024 * 1024  # 16 MB max upload

db = SQLAlchemy(app)

# ──────────────────────────────────────────────
# Models
# ──────────────────────────────────────────────

class Container(db.Model):
    __tablename__ = 'containers'
    id       = db.Column(db.Integer, primary_key=True)
    name     = db.Column(db.String(120), nullable=False)
    icon     = db.Column(db.String(10), default='📦')
    color    = db.Column(db.String(20), default='#10b981')
    created  = db.Column(db.DateTime, default=datetime.utcnow)
    items    = db.relationship('Item', backref='container', lazy=True, cascade='all, delete-orphan')

    def to_dict(self):
        return {
            'id': self.id,
            'name': self.name,
            'icon': self.icon,
            'color': self.color,
            'created': self.created.isoformat(),
            'item_count': len(self.items),
        }


class Item(db.Model):
    __tablename__ = 'items'
    id           = db.Column(db.Integer, primary_key=True)
    container_id = db.Column(db.Integer, db.ForeignKey('containers.id'), nullable=False)
    name         = db.Column(db.String(160), nullable=False)
    quantity     = db.Column(db.String(40), nullable=False)
    unit         = db.Column(db.String(30), default='pcs')
    image_file   = db.Column(db.String(256), nullable=True)
    notes        = db.Column(db.Text, default='')
    created      = db.Column(db.DateTime, default=datetime.utcnow)
    updated      = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    def to_dict(self):
        return {
            'id': self.id,
            'container_id': self.container_id,
            'name': self.name,
            'quantity': self.quantity,
            'unit': self.unit,
            'image_url': f'/static/uploads/{self.image_file}' if self.image_file else None,
            'notes': self.notes,
            'created': self.created.isoformat(),
            'updated': self.updated.isoformat(),
        }


class AuditLog(db.Model):
    """Records every ADD / UPDATE / DELETE action for full change history."""
    __tablename__ = 'audit_logs'
    id          = db.Column(db.Integer, primary_key=True)
    timestamp   = db.Column(db.DateTime, default=datetime.utcnow, index=True)
    action      = db.Column(db.String(10), nullable=False)   # ADD | UPDATE | DELETE
    entity_type = db.Column(db.String(20), nullable=False)   # container | item
    entity_id   = db.Column(db.Integer, nullable=False)
    entity_name = db.Column(db.String(160), nullable=True)
    details     = db.Column(db.Text, nullable=True)          # JSON blob of changed fields

    def to_dict(self):
        return {
            'id': self.id,
            'timestamp': self.timestamp.isoformat(),
            'action': self.action,
            'entity_type': self.entity_type,
            'entity_id': self.entity_id,
            'entity_name': self.entity_name,
            'details': json.loads(self.details) if self.details else None,
        }


# ──────────────────────────────────────────────
# Helpers
# ──────────────────────────────────────────────

def log_audit(action, entity_type, entity_id, entity_name, details=None):
    """Append a row to audit_logs. Call AFTER db.session.commit() on the entity."""
    entry = AuditLog(
        action=action,
        entity_type=entity_type,
        entity_id=entity_id,
        entity_name=entity_name,
        details=json.dumps(details) if details else None,
    )
    db.session.add(entry)
    db.session.commit()


def save_image(data_url):
    """Save a base64 data-URL image to disk and return filename."""
    if not data_url:
        return None
    try:
        header, encoded = data_url.split(',', 1)
        ext = 'jpg'
        if 'png' in header:
            ext = 'png'
        elif 'webp' in header:
            ext = 'webp'
        filename = f"{uuid.uuid4().hex}.{ext}"
        filepath = os.path.join(UPLOAD_FOLDER, filename)
        with open(filepath, 'wb') as f:
            f.write(base64.b64decode(encoded))
        return filename
    except Exception:
        return None

# ──────────────────────────────────────────────
# Routes – Pages
# ──────────────────────────────────────────────

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/container/<int:cid>')
def container_page(cid):
    container = Container.query.get_or_404(cid)
    return render_template('container.html', container=container)

@app.route('/audit')
def audit_page():
    return render_template('audit.html')

# ──────────────────────────────────────────────
# API – Containers
# ──────────────────────────────────────────────

@app.route('/api/containers', methods=['GET'])
def get_containers():
    containers = Container.query.order_by(Container.created.desc()).all()
    return jsonify([c.to_dict() for c in containers])

@app.route('/api/containers', methods=['POST'])
def create_container():
    data = request.json or {}
    name = (data.get('name') or '').strip()
    if not name:
        return jsonify({'error': 'Name is required'}), 400
    c = Container(
        name=name,
        icon=data.get('icon', '📦'),
        color=data.get('color', '#10b981'),
    )
    db.session.add(c)
    db.session.commit()
    log_audit('ADD', 'container', c.id, c.name, {'icon': c.icon, 'color': c.color})
    return jsonify(c.to_dict()), 201

@app.route('/api/containers/<int:cid>', methods=['PUT'])
def update_container(cid):
    c = Container.query.get_or_404(cid)
    data = request.json or {}
    old = {'name': c.name, 'icon': c.icon, 'color': c.color}
    if 'name' in data and data['name'].strip():
        c.name = data['name'].strip()
    if 'icon' in data:
        c.icon = data['icon']
    if 'color' in data:
        c.color = data['color']
    db.session.commit()
    log_audit('UPDATE', 'container', c.id, c.name, {'before': old, 'after': {'name': c.name, 'icon': c.icon, 'color': c.color}})
    return jsonify(c.to_dict())

@app.route('/api/containers/<int:cid>', methods=['DELETE'])
def delete_container(cid):
    c = Container.query.get_or_404(cid)
    snap = {'name': c.name, 'icon': c.icon, 'item_count': len(c.items)}
    for item in c.items:
        if item.image_file:
            path = os.path.join(UPLOAD_FOLDER, item.image_file)
            if os.path.exists(path):
                os.remove(path)
    db.session.delete(c)
    db.session.commit()
    log_audit('DELETE', 'container', cid, snap['name'], snap)
    return jsonify({'ok': True})

# ──────────────────────────────────────────────
# API – Items
# ──────────────────────────────────────────────

@app.route('/api/containers/<int:cid>/items', methods=['GET'])
def get_items(cid):
    Container.query.get_or_404(cid)
    items = Item.query.filter_by(container_id=cid).order_by(Item.created.desc()).all()
    return jsonify([i.to_dict() for i in items])

@app.route('/api/containers/<int:cid>/items', methods=['POST'])
def create_item(cid):
    Container.query.get_or_404(cid)
    data = request.json or {}
    name = (data.get('name') or '').strip()
    if not name:
        return jsonify({'error': 'Name is required'}), 400
    qty = (str(data.get('quantity', '1'))).strip() or '1'
    image_file = save_image(data.get('image'))
    item = Item(
        container_id=cid,
        name=name,
        quantity=qty,
        unit=data.get('unit', 'pcs'),
        image_file=image_file,
        notes=data.get('notes', ''),
    )
    db.session.add(item)
    db.session.commit()
    log_audit('ADD', 'item', item.id, item.name, {
        'container_id': cid, 'quantity': qty, 'unit': item.unit, 'notes': item.notes
    })
    return jsonify(item.to_dict()), 201

@app.route('/api/items/<int:iid>', methods=['PUT'])
def update_item(iid):
    item = Item.query.get_or_404(iid)
    data = request.json or {}
    old = {'name': item.name, 'quantity': item.quantity, 'unit': item.unit, 'notes': item.notes}
    if 'name' in data and data['name'].strip():
        item.name = data['name'].strip()
    if 'quantity' in data:
        item.quantity = str(data['quantity']).strip()
    if 'unit' in data:
        item.unit = data['unit']
    if 'notes' in data:
        item.notes = data['notes']
    if 'image' in data and data['image']:
        if item.image_file:
            old_path = os.path.join(UPLOAD_FOLDER, item.image_file)
            if os.path.exists(old_path):
                os.remove(old_path)
        item.image_file = save_image(data['image'])
    item.updated = datetime.utcnow()
    db.session.commit()
    log_audit('UPDATE', 'item', item.id, item.name, {
        'before': old,
        'after': {'name': item.name, 'quantity': item.quantity, 'unit': item.unit, 'notes': item.notes}
    })
    return jsonify(item.to_dict())

@app.route('/api/items/<int:iid>', methods=['DELETE'])
def delete_item(iid):
    item = Item.query.get_or_404(iid)
    snap = {'name': item.name, 'quantity': item.quantity, 'unit': item.unit, 'container_id': item.container_id}
    if item.image_file:
        path = os.path.join(UPLOAD_FOLDER, item.image_file)
        if os.path.exists(path):
            os.remove(path)
    db.session.delete(item)
    db.session.commit()
    log_audit('DELETE', 'item', iid, snap['name'], snap)
    return jsonify({'ok': True})

# ──────────────────────────────────────────────
# API – Audit Log
# ──────────────────────────────────────────────

@app.route('/api/audit', methods=['GET'])
def get_audit():
    limit  = min(int(request.args.get('limit', 100)), 500)
    offset = int(request.args.get('offset', 0))
    entity = request.args.get('entity')    # 'container' | 'item'
    action = request.args.get('action')    # 'ADD' | 'UPDATE' | 'DELETE'

    q = AuditLog.query
    if entity: q = q.filter_by(entity_type=entity)
    if action: q = q.filter_by(action=action)
    q = q.order_by(AuditLog.timestamp.desc())
    total = q.count()
    logs  = q.offset(offset).limit(limit).all()
    return jsonify({'total': total, 'logs': [l.to_dict() for l in logs]})

# ──────────────────────────────────────────────
# Stats
# ──────────────────────────────────────────────

@app.route('/api/stats', methods=['GET'])
def get_stats():
    return jsonify({
        'containers': Container.query.count(),
        'items': Item.query.count(),
        'audit_entries': AuditLog.query.count(),
    })

# ──────────────────────────────────────────────
# Entry Point
# ──────────────────────────────────────────────

if __name__ == '__main__':
    with app.app_context():
        db.create_all()
    # host='0.0.0.0' allows access from other devices on the same network
    app.run(debug=True, port=5000, host='0.0.0.0')
