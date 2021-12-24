import { open, Database } from 'sqlite';
import * as sqlite3 from 'sqlite3';


export class Repository {

    public connection: Database;

    public async createIndexTable(): Promise<void> {
        await this.connection.exec(`CREATE TABLE IF NOT EXISTS index (
            key integer NOT NULL AUTOINCREMENT,
            archive CHARACTER VARYING(64) NOT NULL,
            
        )`);
    }

    public async connect(databaseName: string): Promise<Database> {
        this.connection = await open({
            filename: `/tmp/${databaseName}.db`,
            driver: sqlite3.Database
        });

        return this.connection;
    }

}
