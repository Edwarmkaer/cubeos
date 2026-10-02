package telemetry

import "time"

// OrderState is durable. Observation decisions are replayed from stored evidence,
// not recomputed using the wall clock during a rebuild.
type OrderState struct {
	Initialized bool              `json:"initialized"`
	Epoch       int64             `json:"epoch"`
	EpochReason string            `json:"epochReason"`
	Sequence    uint32            `json:"sequence"`
	Uptime      uint32            `json:"uptime"`
	ReceivedAt  time.Time         `json:"receivedAt"`
	Candidate   *RestartCandidate `json:"candidate,omitempty"`
}
type RestartCandidate struct {
	Sequence, Uptime uint32
	At               time.Time
}
type Decision struct {
	Kind  string
	Epoch int64
}

func forward(a, b uint32) bool { d := a - b; return d > 0 && d < 1<<31 }
func (s *OrderState) Observe(n, u uint32, boot bool, at time.Time) Decision {
	kind := "ambiguous"
	if !s.Initialized {
		kind = "project"
	} else {
		// Two distinct low BOOT heartbeats confirm a restart only after substantial
		// prior uptime. A mere uptime decrease cannot create an epoch.
		lowBoot := boot && n <= 16 && u <= 5000 && s.Uptime >= 30000
		if lowBoot && (u < s.Uptime || s.Candidate != nil) {
			if c := s.Candidate; c != nil && forward(n, c.Sequence) && forward(u, c.Uptime) && at.Sub(c.At) >= 0 && at.Sub(c.At) <= 10*time.Second {
				s.Epoch++
				s.EpochReason = "confirmed_restart"
				kind = "project"
			} else {
				s.Candidate = &RestartCandidate{n, u, at}
				kind = "restart_candidate"
			}
		} else if forward(n, s.Sequence) {
			du := u - s.Uptime
			elapsed := at.Sub(s.ReceivedAt).Milliseconds()
			if elapsed < 0 {
				elapsed = 0
			}
			if (u == s.Uptime || forward(u, s.Uptime)) && int64(du) <= elapsed+10000 {
				kind = "project"
				if n < s.Sequence {
					s.Epoch++
					s.EpochReason = "sequence_wrap"
				}
			}
		} else if n == s.Sequence && u == s.Uptime {
			kind = "late"
		} else if forward(s.Sequence, n) && (u == s.Uptime || forward(s.Uptime, u)) && s.Uptime-u <= 10000 {
			kind = "late"
		}
	}
	if kind == "project" {
		s.Initialized = true
		s.Sequence = n
		s.Uptime = u
		s.ReceivedAt = at
		s.Candidate = nil
	}
	epoch := s.Epoch
	if kind == "late" && s.EpochReason == "sequence_wrap" && n > s.Sequence && epoch > 0 {
		epoch--
	}
	return Decision{kind, epoch}
}
