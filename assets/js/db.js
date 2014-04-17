var DB = function() {
    var req = indexedDB.deleteDatabase('bugz');
    req.onsuccess = this.open.bind(this);

    this._needs_init_filters = false;
    this.on_filters_updated = function () {};
    this.db = null;
    this.loaded = null;

    return this;
}

DB.prototype.Store = function(db, name) {
    this._db = db;
    this._name = name;
    this._index = null;
    this._range = null;

    this.sort = null;
    this.read = null;

    return this;
}

DB.prototype.Store.prototype.index = function(name) {
    var ret = this._copy();
    ret._index = name;

    return ret;
}

DB.prototype.Store.prototype.only = function(val) {
    var ret = this._copy();

    ret._range = IDBKeyRange.only(val);
    return ret;
}

DB.prototype.Store.prototype._copy = function() {
    var ret = new this._db.Store(this._db, this._name);

    ret._index = this._index;
    ret._range = this._range;

    ret.sort = this.sort;
    ret.read = this.read;

    return ret;
}

DB.prototype.Store.prototype.put = function(item, cb) {
    var tr = this._db.db.transaction(this._name, 'readwrite');
    var store = tr.objectStore(this._name);

    if (cb) {
        tr.oncomplete = (function() {
            cb();
        }).bind(this);
    }

    store.put(item);
}

DB.prototype.Store.prototype.all = function(cb) {
    var tr = this._db.db.transaction(this._name);
    var ret = [];

    tr.oncomplete = (function() {
        if (this.sort != null)
        {
            ret = ret.sort(this.sort);
        }

        cb(ret);
    }).bind(this);

    var store = tr.objectStore(this._name);

    if (this._index) {
        store = store.index(this._index);
    }

    var req;

    if (this._range) {
        req = store.openCursor(this._range);
    } else {
        req = store.openCursor();
    }

    req.onsuccess = (function(e) {
        var cursor = e.target.result;

        if (!cursor) {
            return;
        }

        var record = cursor.value;

        if (this.read != null)
        {
            this.read(record);
        }

        ret.push(record);
        cursor.continue();
    }).bind(this);
}

DB.prototype.filters = function() {
    var ret = new this.Store(this, 'filters');

    ret.sort = function(a, b) {
        if (a.starred != b.starred) {
            return a.starred ? -1 : 1;
        }

        if (a.is_product != b.is_product) {
            return b.is_product ? -1 : 1;
        }

        var n1 = a.name_case;
        var n2 = b.name_case;

        return n1.localeCompare(n2);
    };

    ret.read = function(a) {
        a.name_case = a.name.toLowerCase();
    }

    return ret;
}

DB.prototype.open = function () {
    var req = indexedDB.open('bugzini', 1);

    req.onsuccess = this.open_success.bind(this);
    req.onerror = this.open_error.bind(this);
    req.onupgradeneeded = this.open_upgrade_needed.bind(this);

    return this;
}

DB.prototype.open_success = function(e) {
    this.db = e.target.result;
    this.init_filters();

    if (this.loaded) {
        this.loaded();
    }
}

DB.prototype.open_error = function(e) {
}

DB.prototype.open_upgrade_needed = function(e) {
    this.db = e.target.result;

    switch (e.newVersion)
    {
    case 1:
        this.upgrade_v1();
        break;
    }
}

DB.prototype.upgrade_v1 = function() {
    var filters = this.db.createObjectStore('filters', { keyPath: 'id' });
    filters.createIndex('starred', 'starred', { unique: false });
    filters.createIndex('is_product', 'is_product', { unique: false });
    filters.createIndex('name', 'name', { unique: false });

    this._needs_init_filters = true;
}

DB.prototype.init_filters = function() {
    if (this._needs_init_filters) {
        this.init_filters_load();
    } else {
        this.on_filters_updated();
    }
}

DB.prototype.init_filters_load = function() {
    Service.get('/product/all', {
        success: (function(req, ret) {
            // Load products into filters
            var tr = this.db.transaction('filters', 'readwrite');
            var store = tr.objectStore('filters');

            tr.oncomplete = (function(e) {
                this.on_filters_updated();
            }).bind(this);

            ret.each(function (product) {
                var filter = {
                    description: product.description,
                    name: product.name,
                    id: product.id,
                    query: 'product-id:' + product.id,
                    color: '#268BD2',
                    is_product: true
                }

                store.put(filter);
            });
        }).bind(this),

        error: (function(req) {
            console.log([req.status, req.statusText]);
        }).bind(this)
    });
}

/* vi:ts=4:et */
