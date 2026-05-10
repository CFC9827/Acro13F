
export const fetchWithAuth = async (url: string, options: RequestInit = {}, session: any) => {
    const headers = {
        ...options.headers,
        'Authorization': `Bearer ${session?.access_token || ''}`,
    };
    return fetch(url, { ...options, headers });
};
