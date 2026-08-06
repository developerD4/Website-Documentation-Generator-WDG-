export interface Config {
    baseUrl: string;
    timeout: number;
    headless: boolean;
}
export interface PageInfo {

    pageName: string;

    url: string;

    status?: string;

}