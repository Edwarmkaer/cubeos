package main

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"github.com/Edwarmkaer/cubeos/apps/api/internal/receiver"
	"github.com/jackc/pgx/v5/pgxpool"
	"io"
)

func prepareReceiver(ctx context.Context, pool *pgxpool.Pool, input io.Reader, output io.Writer, mode string) error {
	if mode != "local" {
		return errors.New("receiver preparation requires local mode")
	}
	raw, err := io.ReadAll(io.LimitReader(input, 4097))
	if err != nil || len(raw) > 4096 {
		return errors.New("receiver input must be at most 4 KiB")
	}
	var request struct {
		BindingID        string `json:"bindingId"`
		ExpectedDeviceID string `json:"expectedDeviceId,omitempty"`
		ExpectedSourceID string `json:"expectedSourceId,omitempty"`
	}
	decoder := json.NewDecoder(bytes.NewReader(raw))
	decoder.DisallowUnknownFields()
	if err = decoder.Decode(&request); err != nil {
		return errors.New("invalid receiver input")
	}
	if !receiver.ValidID(request.BindingID) {
		return errors.New("invalid receiver binding ID")
	}
	var extra any
	if decoder.Decode(&extra) != io.EOF {
		return errors.New("receiver input requires one JSON object")
	}
	var binding receiver.Binding
	if request.ExpectedDeviceID != "" || request.ExpectedSourceID != "" {
		binding, err = receiver.EnsureExisting(ctx, pool, receiver.Binding{BindingID: request.BindingID, DeviceID: request.ExpectedDeviceID, SourceID: request.ExpectedSourceID})
	} else {
		binding, err = receiver.Ensure(ctx, pool, request.BindingID)
	}
	if err != nil {
		return err
	}
	return json.NewEncoder(output).Encode(binding)
}
