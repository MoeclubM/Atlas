package middleware

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
)

type adminTokenPayload struct {
	Sub string `json:"sub"`
	Exp int64  `json:"exp"`
}

func AdminAuth(jwtSecret string) gin.HandlerFunc {
	return func(c *gin.Context) {
		auth := c.GetHeader("Authorization")
		if auth == "" || !strings.HasPrefix(auth, "Bearer ") {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
			return
		}

		token := strings.TrimSpace(strings.TrimPrefix(auth, "Bearer "))
		payload, ok := verifyAdminToken(token, jwtSecret)
		if !ok || payload.Sub != "admin" {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
			return
		}

		if payload.Exp > 0 && time.Now().Unix() > payload.Exp {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
			return
		}

		c.Set("admin_sub", payload.Sub)
		c.Next()
	}
}

func verifyAdminToken(token string, jwtSecret string) (adminTokenPayload, bool) {
	var payload adminTokenPayload
	parts := strings.Split(token, ".")
	if len(parts) != 3 {
		return payload, false
	}

	unsigned := parts[0] + "." + parts[1]
	mac := hmac.New(sha256.New, []byte(jwtSecret))
	mac.Write([]byte(unsigned))
	expectedSig := mac.Sum(nil)

	sig, err := base64.RawURLEncoding.DecodeString(parts[2])
	if err != nil {
		return payload, false
	}
	if !hmac.Equal(sig, expectedSig) {
		return payload, false
	}

	payloadBytes, err := base64.RawURLEncoding.DecodeString(parts[1])
	if err != nil {
		return payload, false
	}
	if err := json.Unmarshal(payloadBytes, &payload); err != nil {
		return payload, false
	}

	return payload, true
}
