package geoip

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"regexp"
	"strconv"
	"strings"
	"time"
)

// IPInfo IP和地理位置信息
type IPInfo struct {
	IP        string  `json:"ip"`
	City      string  `json:"city"`
	Region    string  `json:"region"`
	Country   string  `json:"country"`
	Latitude  float64 `json:"latitude"`
	Longitude float64 `json:"longitude"`
	ASN       string  `json:"asn"`
	ISP       string  `json:"isp"`
}

// ipSBResponse ip.sb API响应结构
type ipSBResponse struct {
	Organization    string  `json:"organization"`
	RegionCode      string  `json:"region_code"`
	ISP             string  `json:"isp"`
	City            string  `json:"city"`
	ASNOrganization string  `json:"asn_organization"`
	PostalCode      string  `json:"postal_code"`
	ASN             int     `json:"asn"`
	Latitude        float64 `json:"latitude"`
	IP              string  `json:"ip"`
	ContinentCode   string  `json:"continent_code"`
	Offset          int     `json:"offset"`
	Country         string  `json:"country"`
	Timezone        string  `json:"timezone"`
	CountryCode     string  `json:"country_code"`
	Longitude       float64 `json:"longitude"`
	Region          string  `json:"region"`
}

// ipinfoResponse ipinfo.io API响应结构
type ipinfoResponse struct {
	IP       string `json:"ip"`
	City     string `json:"city"`
	Region   string `json:"region"`
	Country  string `json:"country"`
	Loc      string `json:"loc"`
	Org      string `json:"org"`
	Postal   string `json:"postal"`
	Timezone string `json:"timezone"`
}

// GetIPInfo 自动获取当前公网IP和地理位置信息
func GetIPInfo() (*IPInfo, error) {
	// 尝试 ipinfo.io（免费，无需认证）
	info, err := fetchFromIPInfo()
	if err == nil && info != nil && info.Latitude != 0 && info.Longitude != 0 {
		return info, nil
	}

	// 备用：尝试 ip.sb
	info, err = fetchFromIPSb()
	if err == nil && info != nil && info.Latitude != 0 && info.Longitude != 0 {
		return info, nil
	}

	// 如果所有服务都失败，返回 ipinfo 结果（即使没有坐标）
	info, _ = fetchFromIPInfo()
	if info != nil {
		return info, nil
	}

	return nil, fmt.Errorf("all geoip services failed")
}

// fetchFromIPInfo 使用 ipinfo.io 获取位置
func fetchFromIPInfo() (*IPInfo, error) {
	client := &http.Client{
		Timeout: 10 * time.Second,
	}

	resp, err := client.Get("https://ipinfo.io/json")
	if err != nil {
		return nil, fmt.Errorf("ipinfo request failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("ipinfo returned status: %d", resp.StatusCode)
	}

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("ipinfo read failed: %w", err)
	}

	var apiResp ipinfoResponse
	if err := json.Unmarshal(body, &apiResp); err != nil {
		return nil, fmt.Errorf("ipinfo parse failed: %w", err)
	}

	info := &IPInfo{
		IP:       apiResp.IP,
		City:     apiResp.City,
		Region:   apiResp.Region,
		Country:  apiResp.Country,
		Latitude: 0,
		Longitude: 0,
		ASN:      "",
		ISP:      "",
	}

	// 解析 loc 字段 "31.8639,117.2808"
	if apiResp.Loc != "" {
		parts := strings.Split(apiResp.Loc, ",")
		if len(parts) == 2 {
			if lat, err := strconv.ParseFloat(parts[0], 64); err == nil {
				info.Latitude = lat
			}
			if lon, err := strconv.ParseFloat(parts[1], 64); err == nil {
				info.Longitude = lon
			}
		}
	}

	// 解析 org 字段 "AS4134 CHINANET-BACKBONE"
	if apiResp.Org != "" {
		// 尝试匹配 AS 编号格式
		if asnMatch := regexp.MustCompile(`^(AS\d+)\s*(.+)`).FindStringSubmatch(apiResp.Org); len(asnMatch) == 3 {
			info.ASN = asnMatch[1]
			info.ISP = asnMatch[2]
		} else {
			// 如果没有 AS 编号，整个字符串作为 ISP
			info.ISP = apiResp.Org
		}
	}

	return info, nil
}

// fetchFromIPSb 使用 ip.sb 获取位置
func fetchFromIPSb() (*IPInfo, error) {
	client := &http.Client{
		Timeout: 10 * time.Second,
	}

	resp, err := client.Get("https://api.ip.sb/geoip")
	if err != nil {
		return nil, fmt.Errorf("ip.sb request failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("ip.sb returned status: %d", resp.StatusCode)
	}

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("ip.sb read failed: %w", err)
	}

	var apiResp ipSBResponse
	if err := json.Unmarshal(body, &apiResp); err != nil {
		return nil, fmt.Errorf("ip.sb parse failed: %w", err)
	}

	info := &IPInfo{
		IP:        apiResp.IP,
		City:      apiResp.City,
		Region:    apiResp.Region,
		Country:   apiResp.Country,
		Latitude:  apiResp.Latitude,
		Longitude: apiResp.Longitude,
	}

	return info, nil
}
