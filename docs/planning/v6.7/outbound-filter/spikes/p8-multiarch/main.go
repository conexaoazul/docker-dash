// P3 spike — Go SIGHUP reload POC.
//
// Question: can the v6.7 sidecar swap its allowlist on SIGHUP without dropping
// in-flight connections?
//
// Design: allowlist held in an atomic.Value. Request handlers read it at the
// start of each request (inline, no lock). SIGHUP handler swaps the pointer
// atomically; existing request goroutines finish their old snapshot, new
// requests see the new list.
//
// Success = SIGHUP mid-stream does not error any in-flight request and
// subsequent requests reflect the new allowlist.
package main

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"sync/atomic"
	"syscall"
)

type Policy struct {
	Allowlist []string `json:"allowlist"`
	Version  int      `json:"version"`
}

var policyPtr atomic.Pointer[Policy]

func loadPolicy(path string) (*Policy, error) {
	f, err := os.Open(path)
	if err != nil {
		return nil, err
	}
	defer f.Close()
	var p Policy
	if err := json.NewDecoder(f).Decode(&p); err != nil {
		return nil, err
	}
	return &p, nil
}

func handle(w http.ResponseWriter, r *http.Request) {
	// Read the policy ONCE at request start. Later swaps don't affect this req.
	p := policyPtr.Load()
	host := r.URL.Query().Get("host")
	allowed := false
	for _, h := range p.Allowlist {
		if h == host {
			allowed = true
			break
		}
	}
	fmt.Fprintf(w, "policy=%d allowed=%v for=%s\n", p.Version, allowed, host)
}

func main() {
	path := "/tmp/p3-policy.json"
	p, err := loadPolicy(path)
	if err != nil {
		log.Fatalf("initial load: %v", err)
	}
	policyPtr.Store(p)
	log.Printf("loaded policy v%d", p.Version)

	// SIGHUP reloads
	hup := make(chan os.Signal, 1)
	signal.Notify(hup, syscall.SIGHUP)
	go func() {
		for range hup {
			np, err := loadPolicy(path)
			if err != nil {
				log.Printf("reload failed: %v — keeping old", err)
				continue
			}
			policyPtr.Store(np)
			log.Printf("reloaded policy v%d", np.Version)
		}
	}()

	http.HandleFunc("/check", handle)
	log.Println("listening :29193")
	log.Fatal(http.ListenAndServe(":29193", nil))
}
