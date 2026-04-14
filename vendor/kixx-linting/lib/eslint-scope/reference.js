/**
 * Bitflag indicating a reference is a read operation (variable is used).
 * @type {number}
 */
const READ = 0x1;

/**
 * Bitflag indicating a reference is a write operation (variable is assigned).
 * @type {number}
 */
const WRITE = 0x2;

/**
 * Bitflag indicating a reference is both a read and write operation.
 * @type {number}
 */
const RW = READ | WRITE;

/**
 * Represents a reference (usage) of a variable in the code.
 *
 * Tracks the identifier being referenced, the scope it's referenced from,
 * whether it's read or written, and which variable definition it resolves to.
 * References are resolved by matching them to Variable definitions in the scope hierarchy.
 */
class Reference {
    /**
     * @param {Object} ident - Identifier node being referenced
     * @param {Scope} scope - The scope containing the reference
     * @param {number} flag - Reference type flag (READ, WRITE, or RW)
     * @param {Object} [writeExpr] - The expression being assigned (for write references)
     * @param {boolean|Object} [maybeImplicitGlobal] - Potential implicit global info
     * @param {boolean} [partial] - Whether this is a partial write (e.g., +=)
     * @param {boolean} [init] - Whether this initializes the variable
     */
    constructor(
        ident,
        scope,
        flag,
        writeExpr,
        maybeImplicitGlobal,
        partial,
        init,
    ) {
        this.identifier = ident;
        this.from = scope;
        this.tainted = false;
        this.resolved = null;
        this.flag = flag;

        if (this.isWrite()) {
            this.writeExpr = writeExpr;
            this.partial = partial;
            this.init = init;
        }

        this.__maybeImplicitGlobal = maybeImplicitGlobal;
    }

    /**
     * Determines if this reference can be statically resolved.
     * A reference is static if it's not tainted, resolves to a variable, and that variable is in a static scope.
     * @returns {boolean}
     */
    isStatic() {
        return !this.tainted && Boolean(this.resolved) && this.resolved.scope.isStatic();
    }

    /**
     * Determines if this reference involves writing to the variable.
     * @returns {boolean}
     */
    isWrite() {
        return Boolean(this.flag & Reference.WRITE);
    }

    /**
     * Determines if this reference involves reading from the variable.
     * @returns {boolean}
     */
    isRead() {
        return Boolean(this.flag & Reference.READ);
    }

    /**
     * Determines if this reference only reads the variable (not written).
     * @returns {boolean}
     */
    isReadOnly() {
        return this.flag === Reference.READ;
    }

    /**
     * Determines if this reference only writes to the variable (not read).
     * @returns {boolean}
     */
    isWriteOnly() {
        return this.flag === Reference.WRITE;
    }

    /**
     * Determines if this reference both reads and writes the variable.
     * @returns {boolean}
     */
    isReadWrite() {
        return this.flag === Reference.RW;
    }
}

/**
 * Reference type: read operation
 * @type {number}
 */
Reference.READ = READ;

/**
 * Reference type: write operation
 * @type {number}
 */
Reference.WRITE = WRITE;

/**
 * Reference type: read-write operation
 * @type {number}
 */
Reference.RW = RW;

export default Reference;
