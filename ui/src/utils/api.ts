
const API_URL = import.meta.env.VITE_API_URL || '';

export const fetchWithAuth = async (url: string, options: RequestInit = {}, session: any) => {
    // If url starts with /api and API_URL is set, prepend it
    const finalUrl = (url.startsWith('/api') && API_URL) 
        ? `${API_URL}${url}` 
        : url;

    const headers = {
        ...options.headers,
        'Authorization': `Bearer ${session?.access_token || ''}`,
    };
    return fetch(finalUrl, { ...options, headers });
};
