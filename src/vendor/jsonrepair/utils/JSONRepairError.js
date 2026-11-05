export class JSONRepairError extends Error {
    position;
    constructor(message, position) {
        super(`${message} at position ${position}`);
        this.position = position;
    }
}
