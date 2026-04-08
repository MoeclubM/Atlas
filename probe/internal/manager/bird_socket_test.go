package manager

import (
	"bufio"
	"net"
	"os"
	"path/filepath"
	"testing"
)

func TestParseBirdOutput(t *testing.T) {
	lines := []string{
		"203.0.113.0/24    unicast [bgp1 12:00] * (100) [AS64500i]",
		"\tvia 198.51.100.1 on eth0",
		"198.51.100.0/24    blackhole [static1 12:01] * (200)",
	}

	routes := parseBirdOutput(lines)
	if len(routes) != 2 {
		t.Fatalf("expected 2 routes, got %d", len(routes))
	}

	if routes[0].Network != "203.0.113.0/24" || routes[0].Gateway != "198.51.100.1" || routes[0].Interface != "eth0" || routes[0].Protocol != "bgp1" {
		t.Fatalf("unexpected first route: %+v", routes[0])
	}
	if routes[1].Network != "198.51.100.0/24" || routes[1].Protocol != "static1" {
		t.Fatalf("unexpected second route: %+v", routes[1])
	}
}

func TestRunBirdCommandOverControlSocket(t *testing.T) {
	socketPath := filepath.Join(t.TempDir(), "bird.ctl")

	listener, err := net.Listen("unix", socketPath)
	if err != nil {
		t.Fatalf("listen unix socket failed: %v", err)
	}
	defer listener.Close()

	go func() {
		conn, err := listener.Accept()
		if err != nil {
			return
		}
		defer conn.Close()

		reader := bufio.NewReader(conn)
		_, _ = conn.Write([]byte("0001 BIRD test ready\n"))
		_, _ = reader.ReadString('\n')
		_, _ = conn.Write([]byte("1007-203.0.113.0/24    unicast [bgp1 12:00] * (100)\n"))
		_, _ = conn.Write([]byte(" via 198.51.100.1 on eth0\n"))
		_, _ = conn.Write([]byte("0000 OK\n"))
	}()

	lines, err := runBirdCommand(socketPath, "show route for 203.0.113.1")
	if err != nil {
		t.Fatalf("runBirdCommand returned error: %v", err)
	}

	if len(lines) != 2 {
		t.Fatalf("expected 2 payload lines, got %d (%v)", len(lines), lines)
	}
	if lines[0] != "203.0.113.0/24    unicast [bgp1 12:00] * (100)" {
		t.Fatalf("unexpected first payload line: %q", lines[0])
	}
	if lines[1] != "via 198.51.100.1 on eth0" {
		t.Fatalf("unexpected second payload line: %q", lines[1])
	}
}

func TestResolveBirdSocketPathFromEnvironment(t *testing.T) {
	socketPath := filepath.Join(t.TempDir(), "bird.ctl")
	listener, err := net.Listen("unix", socketPath)
	if err != nil {
		t.Fatalf("listen unix socket failed: %v", err)
	}
	defer listener.Close()

	if err := os.Setenv("BIRD_CONTROL_SOCKET", socketPath); err != nil {
		t.Fatalf("setenv failed: %v", err)
	}
	t.Cleanup(func() { _ = os.Unsetenv("BIRD_CONTROL_SOCKET") })

	resolved, err := resolveBirdSocketPath(nil)
	if err != nil {
		t.Fatalf("resolveBirdSocketPath returned error: %v", err)
	}
	if resolved != socketPath {
		t.Fatalf("expected %q, got %q", socketPath, resolved)
	}
}
