const API_BASE_URL = "http://127.0.0.1:8000"

// Types
export interface User {
  id: number
  username: string
  email: string
  first_name: string
  last_name: string
  user_type: "user" | "artist"
  phone?: string
  profile_image?: string
  bio?: string
  location?: string
  website?: string
  social_links?: Record<string, string>
  is_verified: boolean
  date_joined: string
}

export interface AuthResponse {
  user: User
  access: string
  refresh: string
  message: string
}

export interface LoginData {
  email: string
  password: string
}

export interface RegisterData {
  username: string
  email: string
  password: string
  password_confirm: string
  first_name: string
  last_name: string
  user_type: "user" | "artist"
  phone?: string
}

// Token management
export const tokenManager = {
  getAccessToken: () => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("access_token")
    }
    return null
  },

  getRefreshToken: () => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("refresh_token")
    }
    return null
  },

  setTokens: (access: string, refresh: string) => {
    if (typeof window !== "undefined") {
      localStorage.setItem("access_token", access)
      localStorage.setItem("refresh_token", refresh)
    }
  },

  clearTokens: () => {
    if (typeof window !== "undefined") {
      localStorage.removeItem("access_token")
      localStorage.removeItem("refresh_token")
      localStorage.removeItem("user_data")
    }
  },

  setUser: (user: User) => {
    if (typeof window !== "undefined") {
      localStorage.setItem("user_data", JSON.stringify(user))
    }
  },

  getUser: (): User | null => {
    if (typeof window !== "undefined") {
      const userData = localStorage.getItem("user_data")
      return userData ? JSON.parse(userData) : null
    }
    return null
  },
}

// API client with automatic token refresh
class ApiClient {
  private async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const url = `${API_BASE_URL}${endpoint}`
    const accessToken = tokenManager.getAccessToken()

    const config: RequestInit = {
      headers: {
        "Content-Type": "application/json",
        ...(accessToken && { Authorization: `Bearer ${accessToken}` }),
        ...options.headers,
      },
      ...options,
    }

    try {
      const response = await fetch(url, config)

      // Handle token refresh for 401 errors
      if (response.status === 401 && accessToken) {
        const refreshed = await this.refreshToken()
        if (refreshed) {
          // Retry the original request with new token
          config.headers = {
            ...config.headers,
            Authorization: `Bearer ${tokenManager.getAccessToken()}`,
          }
          const retryResponse = await fetch(url, config)
          if (!retryResponse.ok) {
            throw new Error(`HTTP error! status: ${retryResponse.status}`)
          }
          return retryResponse.json()
        } else {
          // Refresh failed, redirect to login
          tokenManager.clearTokens()
          window.location.href = "/auth/login"
          throw new Error("Authentication failed")
        }
      }

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.message || `HTTP error! status: ${response.status}`)
      }

      return response.json()
    } catch (error) {
      console.error("API request failed:", error)
      throw error
    }
  }

  private async refreshToken(): Promise<boolean> {
    const refreshToken = tokenManager.getRefreshToken()
    if (!refreshToken) return false

    try {
      const response = await fetch(`${API_BASE_URL}/auth/api/token/refresh/`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ refresh: refreshToken }),
      })

      if (response.ok) {
        const data = await response.json()
        tokenManager.setTokens(data.access, refreshToken)
        return true
      }
    } catch (error) {
      console.error("Token refresh failed:", error)
    }

    return false
  }

  // Auth endpoints
  async register(data: RegisterData): Promise<AuthResponse> {
    return this.request<AuthResponse>("/auth/api/register/", {
      method: "POST",
      body: JSON.stringify(data),
    })
  }

  async login(data: LoginData): Promise<AuthResponse> {
    const response = await this.request<{ access: string; refresh: string }>("/auth/api/token/", {
      method: "POST",
      body: JSON.stringify(data),
    })

    // Get user profile after login
    tokenManager.setTokens(response.access, response.refresh)
    const user = await this.getProfile()

    return {
      user,
      access: response.access,
      refresh: response.refresh,
      message: "Login successful",
    }
  }

  async getProfile(): Promise<User> {
    return this.request<User>("/auth/api/profile/")
  }

  async updateProfile(data: Partial<User>): Promise<User> {
    return this.request<User>("/auth/api/profile/", {
      method: "PUT",
      body: JSON.stringify(data),
    })
  }

  async verifyToken(): Promise<boolean> {
    const accessToken = tokenManager.getAccessToken()
    if (!accessToken) return false

    try {
      await this.request("/auth/api/token/verify/", {
        method: "POST",
        body: JSON.stringify({ token: accessToken }),
      })
      return true
    } catch {
      return false
    }
  }
}

export const apiClient = new ApiClient()
