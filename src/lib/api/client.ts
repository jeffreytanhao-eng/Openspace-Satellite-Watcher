export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface PaginatedResponse<T = unknown> extends ApiResponse<T[]> {
  pagination?: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}

export interface SpaceObjectFilter {
  noradId?: number;
  name?: string;
  country?: string;
  objectType?: string;
  isActive?: boolean;
  page?: number;
  pageSize?: number;
}

export interface SearchFilter extends SpaceObjectFilter {
  launchYear?: number;
  minAltitude?: number;
  maxAltitude?: number;
}

export interface TagData {
  name: string;
  color: string;
}

export interface ImportOptions {
  constellation?: string;
  filename?: string;
}

class ApiClient {
  private baseUrl: string;
  private abortControllers: Map<string, AbortController>;

  constructor(baseUrl: string = '/api') {
    this.baseUrl = baseUrl;
    this.abortControllers = new Map();
  }

  private getUrl(path: string): string {
    return `${this.baseUrl}${path}`;
  }

  private getControllerKey(path: string, method: string): string {
    return `${method}:${path}`;
  }

  public abortRequest(path: string, method: string = 'GET'): void {
    const key = this.getControllerKey(path, method);
    const controller = this.abortControllers.get(key);
    if (controller) {
      controller.abort();
      this.abortControllers.delete(key);
    }
  }

  public abortAll(): void {
    this.abortControllers.forEach(controller => controller.abort());
    this.abortControllers.clear();
  }

  private async request<T>(
    path: string,
    options: RequestInit = {}
  ): Promise<ApiResponse<T>> {
    const key = this.getControllerKey(path, options.method || 'GET');
    
    this.abortRequest(path, options.method || 'GET');
    
    const controller = new AbortController();
    this.abortControllers.set(key, controller);

    try {
      const response = await fetch(this.getUrl(path), {
        ...options,
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          ...options.headers
        }
      });

      this.abortControllers.delete(key);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({
          error: `HTTP ${response.status}: ${response.statusText}`
        }));
        throw new Error(errorData.error || `请求失败: ${response.status}`);
      }

      const data = await response.json();
      return data as ApiResponse<T>;
    } catch (error) {
      this.abortControllers.delete(key);
      if (error instanceof DOMException && error.name === 'AbortError') {
        throw new Error('请求已取消');
      }
      throw error;
    }
  }

  public async getSpaceObjects(
    filters?: SpaceObjectFilter
  ): Promise<PaginatedResponse> {
    const params = new URLSearchParams();
    if (filters) {
      Object.entries(filters).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          params.set(key, String(value));
        }
      });
    }

    const path = `/space-objects?${params.toString()}`;
    return this.request(path);
  }

  public async getSpaceObjectById(id: string): Promise<ApiResponse> {
    return this.request(`/space-objects?id=${id}`);
  }

  public async createSpaceObject(data: {
    noradId: number;
    name: string;
    country?: string;
    objectType?: string;
    launchDate?: string;
    launchSite?: string;
    owner?: string;
    isActive?: boolean;
    model3dUrl?: string | null;
    imageUrl?: string | null;
    tleData?: { line1: string; line2: string };
  }): Promise<ApiResponse> {
    return this.request('/space-objects', {
      method: 'POST',
      body: JSON.stringify(data)
    });
  }

  public async updateSpaceObject(data: {
    id: string;
    name?: string;
    country?: string;
    objectType?: string;
    launchDate?: string;
    launchSite?: string;
    owner?: string;
    isActive?: boolean;
  }): Promise<ApiResponse> {
    return this.request('/space-objects', {
      method: 'PUT',
      body: JSON.stringify(data)
    });
  }

  public async patchSpaceObject(data: {
    id: string;
    name?: string;
    country?: string;
    objectType?: string;
    launchDate?: string;
    launchSite?: string;
    owner?: string;
    isActive?: boolean;
  }): Promise<ApiResponse> {
    return this.request('/space-objects', {
      method: 'PATCH',
      body: JSON.stringify(data)
    });
  }

  public async deleteSpaceObject(id: string): Promise<ApiResponse> {
    return this.request(`/space-objects?id=${id}`, {
      method: 'DELETE'
    });
  }

  public async searchSpaceObjects(
    filters: SearchFilter
  ): Promise<PaginatedResponse> {
    return this.request('/space-objects/search', {
      method: 'POST',
      body: JSON.stringify(filters)
    });
  }

  public async getTags(name?: string): Promise<ApiResponse> {
    const params = name ? `?name=${encodeURIComponent(name)}` : '';
    return this.request(`/tags${params}`);
  }

  public async createTag(data: TagData): Promise<ApiResponse> {
    return this.request('/tags', {
      method: 'POST',
      body: JSON.stringify(data)
    });
  }

  public async updateTag(data: {
    id: string;
    name: string;
    color: string;
  }): Promise<ApiResponse> {
    return this.request('/tags', {
      method: 'PUT',
      body: JSON.stringify(data)
    });
  }

  public async patchTag(data: {
    id: string;
    name?: string;
    color?: string;
  }): Promise<ApiResponse> {
    return this.request('/tags', {
      method: 'PATCH',
      body: JSON.stringify(data)
    });
  }

  public async deleteTag(id: string): Promise<ApiResponse> {
    return this.request(`/tags?id=${id}`, {
      method: 'DELETE'
    });
  }

  public async importTLEFromCelestrak(constellation: string): Promise<ApiResponse> {
    return this.request(`/tle/import/celestrak?constellation=${encodeURIComponent(constellation)}`, {
      method: 'POST'
    });
  }

  public async importTLEFromConstellation(constellation: string): Promise<ApiResponse> {
    return this.request(`/tle/import/constellation?constellation=${encodeURIComponent(constellation)}`, {
      method: 'POST'
    });
  }

  public async searchTLEFromCelestrak(query: string): Promise<ApiResponse> {
    return this.request(`/tle/import/search?q=${encodeURIComponent(query)}`);
  }

  public async importTLEFromFile(file: File): Promise<ApiResponse> {
    const formData = new FormData();
    formData.append('file', file);

    return fetch(this.getUrl('/tle/import/file'), {
      method: 'POST',
      body: formData
    }).then(async response => {
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({
          error: `HTTP ${response.status}: ${response.statusText}`
        }));
        throw new Error(errorData.error || `请求失败: ${response.status}`);
      }
      return response.json();
    });
  }
}

export const apiClient = new ApiClient();

export async function fetchSpaceObjects(): Promise<any[]> {
  const response = await apiClient.getSpaceObjects();
  return response.data || [];
}

export default ApiClient;