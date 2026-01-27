package geoip

import (
	"encoding/json"
	"fmt"
	"io"
	"net"
	"net/http"
	"strings"
	"sync"
	"time"
)

// GeoIPService IP地理位置查询服务
type GeoIPService struct {
	client   *http.Client
	cache    sync.Map // key: IP string, value: *Location
	inFlight sync.Map // key: IP string, value: *inFlightCall
}

type inFlightCall struct {
	done chan struct{}
	loc  *Location
	err  error
}

// Location 地理位置信息
type Location struct {
	IP        string  `json:"ip"`
	City      string  `json:"city"`
	Region    string  `json:"region"`
	Country   string  `json:"country"`
	Latitude  float64 `json:"latitude"`
	Longitude float64 `json:"longitude"`
	ISP       string  `json:"isp"`
	ASN       string  `json:"asn"`
	ASName    string  `json:"as_name"`
}

// ip-api.com 响应结构
type ipAPIResponse struct {
	Status      string  `json:"status"`
	Country     string  `json:"country"`
	CountryCode string  `json:"countryCode"`
	Region      string  `json:"region"`
	RegionName  string  `json:"regionName"`
	City        string  `json:"city"`
	Lat         float64 `json:"lat"`
	Lon         float64 `json:"lon"`
	Query       string  `json:"query"`
	ISP         string  `json:"isp"`
	Org         string  `json:"org"`
	AS          string  `json:"as"`
}

// New 创建新的GeoIP服务
func New() *GeoIPService {
	return &GeoIPService{
		client: &http.Client{
			Timeout: 5 * time.Second,
		},
	}
}

// Lookup 查询IP地理位置
func (s *GeoIPService) Lookup(ip string) (*Location, error) {
	// 1. 检查缓存
	if cached, ok := s.cache.Load(ip); ok {
		return cached.(*Location), nil
	}

	// 2. 检查是否为私有IP，跳过API调用
	parsedIP := net.ParseIP(ip)
	if parsedIP != nil && (parsedIP.IsPrivate() || parsedIP.IsLoopback()) {
		return nil, fmt.Errorf("private or loopback IP address")
	}

	// 3. 并发去重：同一 IP 同时只发起一次外部查询
	call := &inFlightCall{done: make(chan struct{})}
	actual, loaded := s.inFlight.LoadOrStore(ip, call)
	if loaded {
		c := actual.(*inFlightCall)
		<-c.done
		if c.err != nil {
			return nil, c.err
		}
		if c.loc == nil {
			return nil, fmt.Errorf("geo ip lookup failed")
		}
		return c.loc, nil
	}

	// 当前 goroutine 负责实际查询
	defer func() {
		s.inFlight.Delete(ip)
		close(call.done)
	}()

	location, err := s.lookupNoDedup(ip)
	call.loc = location
	call.err = err
	if err != nil {
		return nil, err
	}
	return location, nil
}

func (s *GeoIPService) lookupNoDedup(ip string) (*Location, error) {
	// 使用免费的 ip-api.com 服务
	url := fmt.Sprintf("http://ip-api.com/json/%s", ip)

	resp, err := s.client.Get(url)
	if err != nil {
		return nil, fmt.Errorf("failed to query geo ip: %w", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("failed to read response: %w", err)
	}

	var apiResp ipAPIResponse
	if err := json.Unmarshal(body, &apiResp); err != nil {
		return nil, fmt.Errorf("failed to parse response: %w", err)
	}

	if apiResp.Status != "success" {
		return nil, fmt.Errorf("geo ip lookup failed")
	}

	// ip-api 的 as 字段通常形如："AS15169 Google LLC"
	asn, asName := parseAS(apiResp.AS)

	location := &Location{
		IP:        apiResp.Query,
		City:      apiResp.City,
		Region:    apiResp.RegionName,
		Country:   apiResp.Country,
		Latitude:  apiResp.Lat,
		Longitude: apiResp.Lon,
		ISP:       apiResp.ISP,
		ASN:       asn,
		ASName:    asName,
	}

	// 存入缓存
	s.cache.Store(ip, location)

	return location, nil
}

func parseAS(raw string) (asn string, asName string) {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return "", ""
	}

	fields := strings.Fields(raw)
	if len(fields) == 0 {
		return "", ""
	}

	first := fields[0]
	if strings.HasPrefix(first, "AS") || strings.HasPrefix(first, "as") {
		asn = strings.ToUpper(first)
		if len(fields) > 1 {
			asName = strings.Join(fields[1:], " ")
		}
		return asn, asName
	}

	// 兜底：没有 AS 前缀时，把整串作为名称
	return "", raw
}
