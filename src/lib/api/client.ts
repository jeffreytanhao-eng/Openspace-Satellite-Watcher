export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface TagData {
  name: string;
  color: string;
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

  private async request<T>(
    path: string,
    options: RequestInit = {},
    extraHeaders?: Record<string, string>
  ): Promise<ApiResponse<T>> {
    const isFormData = options.body instanceof FormData;
    const headers: Record<string, string> = {
      ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
      ...(extraHeaders || {}),
      ...(options.headers as Record<string, string> || {}),
    };

    try {
      const response = await fetch(this.getUrl(path), { ...options, headers });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({
          error: `HTTP ${response.status}: ${response.statusText}`
        }));
        throw new Error(errorData.error || `请求失败: ${response.status}`);
      }
      // 防御性检查：响应体可能为空（热重载/中间件中断/缓存竞态），避免 "Unexpected end of JSON input"
      const text = await response.text();
      if (!text || text.trim() === '') {
        throw new Error('服务器返回空响应，请刷新页面重试');
      }
      return JSON.parse(text);
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        throw new Error('请求已取消');
      }
      throw error;
    }
  }

  // 获取卫星列表
  // - includeAll=false（默认）：只返回 14 颗缺省卫星
  // - includeAll=true：返回全部卫星（供 DB 同步等高级操作使用）
  public async getSpaceObjects(includeAll: boolean = false): Promise<ApiResponse<any[]>> {
    const query = includeAll ? '?all=true' : '';
    return this.request(`/space-objects${query}`);
  }

  // 获取标签
  public async getTags(name?: string): Promise<ApiResponse<any[]>> {
    const params = name ? `?name=${encodeURIComponent(name)}` : '';
    return this.request(`/tags${params}`);
  }

  // TLE 导入（代理 Celestrak 搜索，无需密码）
  public async importTLEFromCelestrak(category: string): Promise<ApiResponse> {
    return this.request(`/tle/import/celestrak?category=${encodeURIComponent(category)}`, { method: 'POST' });
  }

  public async importTLEFromConstellation(constellation: string): Promise<ApiResponse> {
    return this.request(`/tle/import/constellation?constellation=${encodeURIComponent(constellation)}`, { method: 'POST' });
  }

  public async searchTLEFromCelestrak(query: string): Promise<ApiResponse> {
    return this.request(`/tle/import/search?q=${encodeURIComponent(query)}`);
  }

  // NASA 图片搜索（无需密码）
  public async searchNasaImages(query: string): Promise<ApiResponse> {
    return this.request(`/nasa-image-search?q=${encodeURIComponent(query)}`);
  }

  // 上传图片（需要密码）
  public async uploadSatelliteImage(noradId: number, file: File, password: string): Promise<ApiResponse> {
    const formData = new FormData();
    formData.append('noradId', String(noradId));
    formData.append('file', file);
    return this.request('/admin/upload-image', {
      method: 'POST',
      body: formData,
    }, { 'x-admin-password': password });
  }
}

export const apiClient = new ApiClient();

export async function fetchSpaceObjects(): Promise<any[]> {
  const response = await apiClient.getSpaceObjects();
  return response.data || [];
}

export async function fetchTags(): Promise<any[]> {
  const response = await apiClient.getTags();
  return response.data || [];
}

export default ApiClient;
