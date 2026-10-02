package main

import (
	"net"
	"net/url"
)

func secureEndpoint(endpoint string) bool {
	u, e := url.Parse(endpoint)
	if e != nil || u.User != nil || u.Host == "" || u.Path != "" || u.RawQuery != "" || u.Fragment != "" {
		return false
	}
	if u.Scheme == "https" {
		return true
	}
	ip := net.ParseIP(u.Hostname())
	return u.Scheme == "http" && ip != nil && ip.IsLoopback()
}
